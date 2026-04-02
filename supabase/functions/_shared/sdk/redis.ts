import { structuredLog } from "./utils.ts";

export interface RedisConfig {
  url: string;
  token: string;
}

export class RedisClient {
  private readonly url: string;
  private readonly headers: Record<string, string>;

  constructor(config: RedisConfig) {
    this.url = config.url.replace(/\/$/, "");
    this.headers = {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    };
  }

  private async command<T>(cmd: unknown[]): Promise<T> {
    const res = await fetch(`${this.url}`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(cmd),
    });

    if (!res.ok) {
      const errorBody = await res.text();
      structuredLog("error", "redis_command_error", {
        cmd: String(cmd[0]),
        status: res.status,
        error: errorBody,
      });
      throw new Error(`Redis command failed: ${res.status} ${errorBody}`);
    }

    const data = (await res.json()) as { result: T };
    return data.result;
  }

  async get<T>(key: string): Promise<T | null> {
    const result = await this.command<string | null>(["GET", key]);
    if (result === null) return null;
    return JSON.parse(result) as T;
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const serialized = JSON.stringify(value);
    if (ttlSeconds) {
      await this.command(["SET", key, serialized, "EX", ttlSeconds]);
    } else {
      await this.command(["SET", key, serialized]);
    }
  }

  async del(key: string): Promise<void> {
    await this.command(["DEL", key]);
  }

  /** Increment a key by 1. Returns new value. Creates key with value 1 if not exists. */
  async incr(key: string): Promise<number> {
    return this.command<number>(["INCR", key]);
  }

  /** Set expiration on an existing key (seconds). */
  async expire(key: string, ttlSeconds: number): Promise<void> {
    await this.command(["EXPIRE", key, ttlSeconds]);
  }

  /** Get TTL of a key in seconds. Returns -1 if no expiry, -2 if key doesn't exist. */
  async ttl(key: string): Promise<number> {
    return this.command<number>(["TTL", key]);
  }
}
