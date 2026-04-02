import { structuredLog } from "./utils.ts";

export interface SupabaseConfig {
  url: string;
  serviceRoleKey: string;
}

export class SupabaseClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  constructor(config: SupabaseConfig) {
    this.baseUrl = `${config.url.replace(/\/$/, "")}/rest/v1`;
    this.headers = {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    };
  }

  /**
   * Generic query method. Table names are quoted for PascalCase support.
   */
  async query<T>(
    table: string,
    options: {
      select?: string;
      filters?: Record<string, string>;
      order?: string;
      limit?: number;
    } = {},
  ): Promise<T[]> {
    const url = new URL(`${this.baseUrl}/"${table}"`);

    if (options.select) url.searchParams.set("select", options.select);
    if (options.order) url.searchParams.set("order", options.order);
    if (options.limit) url.searchParams.set("limit", String(options.limit));

    if (options.filters) {
      for (const [key, value] of Object.entries(options.filters)) {
        url.searchParams.set(key, value);
      }
    }

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: this.headers,
    });

    if (!res.ok) {
      const errorBody = await res.text();
      structuredLog("error", "supabase_query_error", { table, status: res.status, error: errorBody });
      throw new Error(`Supabase query "${table}" failed: ${res.status} ${errorBody}`);
    }

    return res.json() as Promise<T[]>;
  }

  /**
   * Insert a row into a table. Returns the inserted row.
   */
  async insert<T>(table: string, data: Record<string, unknown>): Promise<T> {
    const res = await fetch(`${this.baseUrl}/"${table}"`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const errorBody = await res.text();
      structuredLog("error", "supabase_insert_error", { table, status: res.status, error: errorBody });
      throw new Error(`Supabase insert "${table}" failed: ${res.status} ${errorBody}`);
    }

    const rows = (await res.json()) as T[];
    // PostgREST returns an array with Prefer: return=representation
    return (Array.isArray(rows) ? rows[0] : rows) as T;
  }

  /**
   * Update a row by id. Returns the updated row.
   */
  async update<T>(table: string, id: string, data: Record<string, unknown>): Promise<T> {
    const url = new URL(`${this.baseUrl}/"${table}"`);
    url.searchParams.set("id", `eq.${id}`);

    const res = await fetch(url.toString(), {
      method: "PATCH",
      headers: this.headers,
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const errorBody = await res.text();
      structuredLog("error", "supabase_update_error", { table, id, status: res.status, error: errorBody });
      throw new Error(`Supabase update "${table}" id=${id} failed: ${res.status} ${errorBody}`);
    }

    const rows = (await res.json()) as T[];
    return (Array.isArray(rows) ? rows[0] : rows) as T;
  }

  /**
   * Call a Postgres RPC function.
   */
  async rpc<T>(functionName: string, params?: Record<string, unknown>): Promise<T> {
    const res = await fetch(`${this.baseUrl}/rpc/${functionName}`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(params ?? {}),
    });

    if (!res.ok) {
      const errorBody = await res.text();
      structuredLog("error", "supabase_rpc_error", { fn: functionName, status: res.status, error: errorBody });
      throw new Error(`Supabase RPC "${functionName}" failed: ${res.status} ${errorBody}`);
    }

    return res.json() as Promise<T>;
  }

  /**
   * Raw GET request via PostgREST for complex filters.
   * The path is appended to the base REST URL (e.g. `/"Service"?unitId=eq.xxx&isActive=eq.true`).
   */
  async rawGet<T>(path: string): Promise<T[]> {
    const url = `${this.baseUrl}/${path}`;

    const res = await fetch(url, {
      method: "GET",
      headers: this.headers,
    });

    if (!res.ok) {
      const errorBody = await res.text();
      structuredLog("error", "supabase_raw_get_error", { path, status: res.status, error: errorBody });
      throw new Error(`Supabase rawGet "${path}" failed: ${res.status} ${errorBody}`);
    }

    return res.json() as Promise<T[]>;
  }
}
