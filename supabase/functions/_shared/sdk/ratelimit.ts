import { structuredLog } from "./utils.ts";
import type { RedisClient } from "./redis.ts";
import type { SupabaseClient } from "./supabase.ts";
import type { Plan, QuotaCheckResult } from "./types.ts";

// ─── Default limits (used when no plan is assigned) ────────────────────────

const DEFAULT_LIMITS: Pick<
  Plan,
  | "maxAiMessagesPerMonth"
  | "maxClientsPerUnit"
  | "maxProfessionalsPerUnit"
  | "maxCampaignsPerDay"
  | "maxMessagesPerPhonePerHour"
> = {
  maxAiMessagesPerMonth: 100,
  maxClientsPerUnit: 50,
  maxProfessionalsPerUnit: 1,
  maxCampaignsPerDay: 1,
  maxMessagesPerPhonePerHour: 20,
};

// ─── Key builders ──────────────────────────────────────────────────────────

function monthlyKey(unitId: string): string {
  const now = new Date();
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return `quota:ai_msg:${unitId}:${period}`;
}

function dailyCampaignKey(unitId: string): string {
  const now = new Date();
  const period = now.toISOString().split("T")[0]!;
  return `quota:campaign:${unitId}:${period}`;
}

function hourlyPhoneKey(unitId: string, phone: string): string {
  const now = new Date();
  const hour = `${now.toISOString().split("T")[0]}T${String(now.getHours()).padStart(2, "0")}`;
  return `quota:phone:${unitId}:${phone}:${hour}`;
}

// ─── Plan resolution ───────────────────────────────────────────────────────

export async function getUnitPlan(
  supabase: SupabaseClient,
  unitId: string,
): Promise<Plan | null> {
  try {
    // Get active plan assignment for this unit
    const assignments = await supabase.query<{ planId: string }>("UnitPlan", {
      filters: {
        unitId: `eq.${unitId}`,
        isActive: "eq.true",
      },
      order: "createdAt.desc",
      limit: 1,
    });

    if (assignments.length === 0 || !assignments[0]) {
      return null;
    }

    // Get the plan details
    const plans = await supabase.query<Plan>("Plan", {
      filters: {
        id: `eq.${assignments[0].planId}`,
        isActive: "eq.true",
      },
      limit: 1,
    });

    return plans[0] ?? null;
  } catch (err) {
    structuredLog("error", "get_unit_plan_error", {
      unitId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

// ─── Quota checks ──────────────────────────────────────────────────────────

/**
 * Check if a unit can send an AI message (monthly quota).
 * Increments the counter if allowed.
 */
export async function checkAndIncrementAiQuota(
  redis: RedisClient,
  supabase: SupabaseClient,
  unitId: string,
): Promise<QuotaCheckResult> {
  const plan = await getUnitPlan(supabase, unitId);
  const limit = plan?.maxAiMessagesPerMonth ?? DEFAULT_LIMITS.maxAiMessagesPerMonth;

  const key = monthlyKey(unitId);
  const current = await redis.incr(key);

  // Set TTL on first increment (expire at end of month ≈ 32 days)
  if (current === 1) {
    await redis.expire(key, 32 * 24 * 60 * 60);
  }

  const allowed = current <= limit;

  if (!allowed) {
    structuredLog("warn", "ai_quota_exceeded", { unitId, current, limit });
  }

  return {
    allowed,
    current,
    limit,
    metric: "ai_messages_monthly",
    remainingPercent: Math.max(0, Math.round(((limit - current) / limit) * 100)),
  };
}

/**
 * Check if a phone number is within the hourly message limit (anti-flood).
 * Increments the counter if allowed.
 */
export async function checkPhoneRateLimit(
  redis: RedisClient,
  supabase: SupabaseClient,
  unitId: string,
  phone: string,
): Promise<QuotaCheckResult> {
  const plan = await getUnitPlan(supabase, unitId);
  const limit = plan?.maxMessagesPerPhonePerHour ?? DEFAULT_LIMITS.maxMessagesPerPhonePerHour;

  const key = hourlyPhoneKey(unitId, phone);
  const current = await redis.incr(key);

  // Expire at end of hour (3600 seconds)
  if (current === 1) {
    await redis.expire(key, 3600);
  }

  const allowed = current <= limit;

  if (!allowed) {
    structuredLog("warn", "phone_rate_limit_exceeded", { unitId, phone, current, limit });
  }

  return {
    allowed,
    current,
    limit,
    metric: "messages_per_phone_hourly",
    remainingPercent: Math.max(0, Math.round(((limit - current) / limit) * 100)),
  };
}

/**
 * Check if a unit can send more campaign messages today.
 * Increments the counter if allowed.
 */
export async function checkCampaignQuota(
  redis: RedisClient,
  supabase: SupabaseClient,
  unitId: string,
): Promise<QuotaCheckResult> {
  const plan = await getUnitPlan(supabase, unitId);
  const limit = plan?.maxCampaignsPerDay ?? DEFAULT_LIMITS.maxCampaignsPerDay;

  const key = dailyCampaignKey(unitId);
  const current = await redis.incr(key);

  // Expire at end of day (86400 seconds)
  if (current === 1) {
    await redis.expire(key, 86400);
  }

  const allowed = current <= limit;

  if (!allowed) {
    structuredLog("warn", "campaign_quota_exceeded", { unitId, current, limit });
  }

  return {
    allowed,
    current,
    limit,
    metric: "campaigns_daily",
    remainingPercent: Math.max(0, Math.round(((limit - current) / limit) * 100)),
  };
}

/**
 * Get current usage summary for a unit (without incrementing).
 */
export async function getUsageSummary(
  redis: RedisClient,
  supabase: SupabaseClient,
  unitId: string,
): Promise<{
  plan: Pick<Plan, "name" | "slug"> | null;
  aiMessages: { current: number; limit: number; remainingPercent: number };
  campaignsToday: { current: number; limit: number; remainingPercent: number };
}> {
  const plan = await getUnitPlan(supabase, unitId);

  const aiLimit = plan?.maxAiMessagesPerMonth ?? DEFAULT_LIMITS.maxAiMessagesPerMonth;
  const campaignLimit = plan?.maxCampaignsPerDay ?? DEFAULT_LIMITS.maxCampaignsPerDay;

  // Get current counts without incrementing
  const aiKey = monthlyKey(unitId);
  const campaignKey = dailyCampaignKey(unitId);

  let aiCurrent = 0;
  let campaignCurrent = 0;

  try {
    const aiVal = await redis.get<number>(aiKey);
    if (aiVal !== null) aiCurrent = aiVal;
  } catch {
    // Key doesn't exist
  }

  try {
    const campVal = await redis.get<number>(campaignKey);
    if (campVal !== null) campaignCurrent = campVal;
  } catch {
    // Key doesn't exist
  }

  return {
    plan: plan ? { name: plan.name, slug: plan.slug } : null,
    aiMessages: {
      current: aiCurrent,
      limit: aiLimit,
      remainingPercent: Math.max(0, Math.round(((aiLimit - aiCurrent) / aiLimit) * 100)),
    },
    campaignsToday: {
      current: campaignCurrent,
      limit: campaignLimit,
      remainingPercent: Math.max(0, Math.round(((campaignLimit - campaignCurrent) / campaignLimit) * 100)),
    },
  };
}
