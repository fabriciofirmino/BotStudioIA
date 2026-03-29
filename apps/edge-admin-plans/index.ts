/**
 * Edge Function: Admin Plans Management
 *
 * REST API para gerenciar planos, atribuicoes de plano a unidades e visualizar uso.
 * Todas as rotas exigem Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>.
 *
 * Rotas:
 *   GET    /                          → Lista todos os planos ativos
 *   POST   /                          → Cria um novo plano
 *   PATCH  /:planId                   → Atualiza um plano
 *   DELETE /:planId                   → Desativa um plano (soft delete)
 *   GET    /unit/:unitId              → Plano atual da unidade + resumo de uso
 *   POST   /unit/:unitId/assign       → Atribui um plano a uma unidade
 *   DELETE /unit/:unitId/plan         → Remove plano da unidade (reverte p/ padrao)
 */

import {
  SupabaseClient,
  RedisClient,
  structuredLog,
  getUsageSummary,
} from "../../packages/studioflow-sdk/src/index.ts";
import type {
  Plan,
  UnitPlan,
} from "../../packages/studioflow-sdk/src/index.ts";

// ─── Helpers ───────────────────────────────────────────────────────────────

const CORS_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: CORS_HEADERS });
}

function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}

/** Verify the request has a valid Authorization header (service_role key) */
function verifyAuth(req: Request): boolean {
  const auth = req.headers.get("authorization");
  if (!auth) return false;
  const token = auth.replace("Bearer ", "");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  return token === serviceRoleKey;
}

/**
 * Parse route segments from the URL pathname.
 *
 * Pattern: /functions/v1/edge-admin-plans[/seg1[/seg2[/seg3]]]
 *
 * Returns an array of segments after the function name, e.g.:
 *   /                        → []
 *   /:planId                 → [planId]
 *   /unit/:unitId            → ["unit", unitId]
 *   /unit/:unitId/assign     → ["unit", unitId, "assign"]
 *   /unit/:unitId/plan       → ["unit", unitId, "plan"]
 */
function parseRoute(url: URL): string[] {
  const parts = url.pathname.split("/").filter(Boolean);
  const funcIndex = parts.indexOf("edge-admin-plans");
  if (funcIndex === -1) return parts.slice(1); // fallback: skip leading empty
  return parts.slice(funcIndex + 1);
}

// ─── Main Handler ──────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return jsonResponse(null, 204);
  }

  // Auth check
  if (!verifyAuth(req)) {
    return errorResponse("Unauthorized", 401);
  }

  const url = new URL(req.url);
  const segments = parseRoute(url);

  const supabase = new SupabaseClient({
    url: Deno.env.get("SUPABASE_URL") ?? "",
    serviceRoleKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  });

  const redis = new RedisClient({
    url: Deno.env.get("UPSTASH_REDIS_URL") ?? "",
    token: Deno.env.get("UPSTASH_REDIS_TOKEN") ?? "",
  });

  try {
    // ── GET / → List all active plans ───────────────────────────────
    if (segments.length === 0 && req.method === "GET") {
      structuredLog("info", "plans_list");

      const plans = await supabase.query<Plan>("Plan", {
        filters: { isActive: "eq.true" },
        order: "price.asc",
      });

      return jsonResponse({ plans });
    }

    // ── POST / → Create a new plan ──────────────────────────────────
    if (segments.length === 0 && req.method === "POST") {
      const body = await req.json();

      const requiredFields = [
        "name",
        "slug",
        "maxAiMessagesPerMonth",
        "maxClientsPerUnit",
        "maxProfessionalsPerUnit",
        "maxCampaignsPerDay",
        "maxMessagesPerPhonePerHour",
        "price",
      ];

      for (const field of requiredFields) {
        if (body[field] === undefined || body[field] === null) {
          return errorResponse(`Missing required field: ${field}`);
        }
      }

      structuredLog("info", "plan_create", { name: body.name, slug: body.slug });

      const plan = await supabase.insert<Plan>("Plan", {
        name: body.name,
        slug: body.slug,
        maxAiMessagesPerMonth: body.maxAiMessagesPerMonth,
        maxClientsPerUnit: body.maxClientsPerUnit,
        maxProfessionalsPerUnit: body.maxProfessionalsPerUnit,
        maxCampaignsPerDay: body.maxCampaignsPerDay,
        maxMessagesPerPhonePerHour: body.maxMessagesPerPhonePerHour,
        price: body.price,
        isActive: true,
      });

      return jsonResponse({ plan }, 201);
    }

    // ── Unit routes: /unit/:unitId/... ──────────────────────────────
    if (segments[0] === "unit") {
      const unitId = segments[1] ?? null;

      if (!unitId) {
        return errorResponse("Unit ID required in URL path", 400);
      }

      const action = segments[2] ?? null;

      // ── GET /unit/:unitId → Get unit's current plan + usage ───────
      if (!action && req.method === "GET") {
        structuredLog("info", "unit_usage_summary", { unitId });

        const usage = await getUsageSummary(redis, supabase, unitId);
        return jsonResponse(usage);
      }

      // ── POST /unit/:unitId/assign → Assign a plan to a unit ──────
      if (action === "assign" && req.method === "POST") {
        const body = await req.json();

        if (!body.planId) {
          return errorResponse("Missing required field: planId");
        }

        structuredLog("info", "unit_plan_assign", { unitId, planId: body.planId });

        // Deactivate any existing active plan for this unit
        const existingPlans = await supabase.query<UnitPlan>("UnitPlan", {
          filters: { unitId: `eq.${unitId}`, isActive: "eq.true" },
        });

        for (const existing of existingPlans) {
          await supabase.update<UnitPlan>("UnitPlan", existing.id, { isActive: false });
          structuredLog("info", "unit_plan_deactivated", { unitId, oldUnitPlanId: existing.id });
        }

        // Insert the new assignment
        const assignment = await supabase.insert<UnitPlan>("UnitPlan", {
          unitId,
          planId: body.planId,
          startsAt: new Date().toISOString(),
          expiresAt: body.expiresAt ?? null,
          isActive: true,
        });

        return jsonResponse({ assignment }, 201);
      }

      // ── DELETE /unit/:unitId/plan → Remove plan from unit ─────────
      if (action === "plan" && req.method === "DELETE") {
        structuredLog("info", "unit_plan_remove", { unitId });

        // Find all active UnitPlan entries for this unit
        const activePlans = await supabase.rawGet<UnitPlan>(
          `"UnitPlan"?unitId=eq.${unitId}&isActive=eq.true`,
        );

        if (activePlans.length === 0) {
          return jsonResponse({ message: "No active plan found for this unit", deactivated: 0 });
        }

        // Deactivate each one
        let deactivatedCount = 0;
        for (const up of activePlans) {
          await supabase.update<UnitPlan>("UnitPlan", up.id, { isActive: false });
          deactivatedCount++;
        }

        structuredLog("info", "unit_plan_removed", { unitId, deactivatedCount });

        return jsonResponse({ deleted: true, deactivated: deactivatedCount });
      }

      return errorResponse(
        `Unknown unit action: ${action ?? "(none)"}. Available: GET /unit/:unitId, POST /unit/:unitId/assign, DELETE /unit/:unitId/plan`,
        404,
      );
    }

    // ── Plan-specific routes: /:planId ──────────────────────────────
    const planId = segments[0] ?? null;

    if (!planId) {
      return errorResponse("Not found", 404);
    }

    // ── PATCH /:planId → Update a plan ──────────────────────────────
    if (req.method === "PATCH") {
      const body = await req.json();

      if (!body || Object.keys(body).length === 0) {
        return errorResponse("Request body must contain at least one field to update");
      }

      structuredLog("info", "plan_update", { planId, fields: Object.keys(body) });

      const plan = await supabase.update<Plan>("Plan", planId, body);
      return jsonResponse({ plan });
    }

    // ── DELETE /:planId → Deactivate a plan (soft delete) ───────────
    if (req.method === "DELETE") {
      structuredLog("info", "plan_deactivate", { planId });

      await supabase.update("Plan", planId, { isActive: false });
      return jsonResponse({ deleted: true });
    }

    // ── GET /:planId → (not a defined route, but handle gracefully) ─
    if (req.method === "GET") {
      return errorResponse(
        "Unknown route. Available: GET /, POST /, PATCH /:planId, DELETE /:planId, GET /unit/:unitId, POST /unit/:unitId/assign, DELETE /unit/:unitId/plan",
        404,
      );
    }

    // ── Unknown route ───────────────────────────────────────────────
    return errorResponse(
      "Method not allowed. Available methods: GET, POST, PATCH, DELETE",
      405,
    );
  } catch (error) {
    structuredLog("error", "admin_plans_error", {
      segments,
      method: req.method,
      error: error instanceof Error ? error.message : String(error),
    });
    return errorResponse(
      error instanceof Error ? error.message : "Internal server error",
      500,
    );
  }
});
