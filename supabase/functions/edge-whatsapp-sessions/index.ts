/**
 * Edge Function: WhatsApp Session Management
 *
 * REST API para gerenciar sessões WAHA (criar, QR Code, status, desconectar).
 * Chamado pelo frontend/dashboard do StudioFlow.
 *
 * Rotas:
 *   GET    /                         → Lista todas as sessões WAHA
 *   GET    /:unitId/status           → Status da sessão de uma Unit
 *   POST   /:unitId/connect          → Cria sessão + retorna QR Code
 *   GET    /:unitId/qr               → Retorna QR Code (raw text)
 *   GET    /:unitId/qr-image         → Retorna QR Code como imagem base64
 *   POST   /:unitId/disconnect       → Desconecta (logout) a sessão
 *   POST   /:unitId/restart          → Reinicia a sessão
 *   DELETE /:unitId/delete           → Remove a sessão permanentemente
 */

import {
  SupabaseClient,
  WahaClient,
  structuredLog,
} from "../_shared/sdk/index.ts";
import type {
  Unit,
} from "../_shared/sdk/index.ts";

// ─── Helpers ───────────────────────────────────────────────────────────────

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
    },
  });
}

function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}

/** Extract route segments: /unitId/action → { unitId, action } */
function parseRoute(url: URL): { unitId: string | null; action: string | null } {
  // Edge Function URL: /functions/v1/edge-whatsapp-sessions/unitId/action
  const path = url.pathname;
  // Remove the edge function prefix
  const segments = path.split("/").filter(Boolean);
  // Last segments are unitId and action
  // Pattern: .../edge-whatsapp-sessions  or  .../edge-whatsapp-sessions/unitId/action
  const funcIndex = segments.indexOf("edge-whatsapp-sessions");
  if (funcIndex === -1) {
    return { unitId: null, action: null };
  }
  const unitId = segments[funcIndex + 1] ?? null;
  const action = segments[funcIndex + 2] ?? null;
  return { unitId, action };
}

/** Verify the request has a valid Authorization header (service_role key) */
function verifyAuth(req: Request): boolean {
  const auth = req.headers.get("authorization");
  if (!auth) return false;
  const token = auth.replace("Bearer ", "");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  return token === serviceRoleKey;
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
  const { unitId, action } = parseRoute(url);

  const waha = new WahaClient({
    apiUrl: Deno.env.get("WAHA_API_URL") ?? "",
    apiKey: Deno.env.get("WAHA_API_KEY") ?? "",
  });

  const supabase = new SupabaseClient({
    url: Deno.env.get("SUPABASE_URL") ?? "",
    serviceRoleKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  });

  try {
    // ── GET / → List all sessions ────────────────────────────────────
    if (!unitId && req.method === "GET") {
      const sessions = await waha.listSessions();
      return jsonResponse({ sessions });
    }

    if (!unitId) {
      return errorResponse("Unit ID required in URL path", 400);
    }

    // ── Resolve Unit from DB ─────────────────────────────────────────
    const units = await supabase.query<Unit>("Unit", {
      filters: { id: `eq.${unitId}` },
      limit: 1,
    });

    if (units.length === 0 || !units[0]) {
      return errorResponse("Unit not found", 404);
    }

    const unit = units[0];
    const sessionName = unit.whatsappInstance;

    if (!sessionName) {
      return errorResponse(
        "Unit does not have a whatsappInstance configured. Set it in the Unit table first.",
        400,
      );
    }

    // ── GET /:unitId/status → Session status ─────────────────────────
    if (action === "status" && req.method === "GET") {
      try {
        const session = await waha.getSession(sessionName);
        return jsonResponse({
          unitId: unit.id,
          unitName: unit.name,
          session: sessionName,
          status: session.status,
          connected: session.status === "WORKING",
          me: session.me,
        });
      } catch {
        // Session doesn't exist in WAHA
        return jsonResponse({
          unitId: unit.id,
          unitName: unit.name,
          session: sessionName,
          status: "NOT_CREATED",
          connected: false,
          me: null,
        });
      }
    }

    // ── POST /:unitId/connect → Create session + return QR ───────────
    if (action === "connect" && req.method === "POST") {
      const webhookUrl = Deno.env.get("WEBHOOK_URL")
        ?? `${Deno.env.get("SUPABASE_URL") ?? ""}/functions/v1/edge-whatsapp-webhook`;
      const webhookSecret = Deno.env.get("WEBHOOK_SECRET") ?? "";

      // Check if session already exists
      let existingStatus: string | null = null;
      try {
        const existing = await waha.getSession(sessionName);
        existingStatus = existing.status;
      } catch {
        // Session doesn't exist, will create
      }

      if (existingStatus === "WORKING") {
        return jsonResponse({
          unitId: unit.id,
          session: sessionName,
          status: "WORKING",
          connected: true,
          message: "Session already connected. Use /disconnect first to reconnect.",
        });
      }

      // If session exists but not WORKING, restart it
      if (existingStatus) {
        try {
          await waha.stopSession(sessionName);
        } catch {
          // May fail if already stopped
        }
        try {
          await waha.deleteSession(sessionName);
        } catch {
          // May fail if doesn't exist
        }
      }

      // Create new session with webhook configured
      const webhookConfig = {
        url: webhookUrl,
        events: ["message"],
        ...(webhookSecret ? { hmac: { key: webhookSecret } } : {}),
      };

      await waha.createSession({
        name: sessionName,
        webhooks: [webhookConfig],
        start: true,
      });

      // Wait a moment for WAHA to initialize and generate QR
      await new Promise((r) => setTimeout(r, 3000));

      // Check status — should be SCAN_QR_CODE
      let status = "STARTING";
      let qrCode: string | null = null;
      let qrImage: string | null = null;

      try {
        const session = await waha.getSession(sessionName);
        status = session.status;

        if (session.status === "SCAN_QR_CODE") {
          try {
            const qr = await waha.getQrCode(sessionName);
            qrCode = qr.value;
          } catch {
            // QR not ready yet
          }
          try {
            qrImage = await waha.getQrCodeImage(sessionName);
          } catch {
            // QR image not ready yet
          }
        }
      } catch {
        // Session may still be starting
      }

      structuredLog("info", "session_connect", {
        unitId: unit.id,
        session: sessionName,
        status,
      });

      return jsonResponse({
        unitId: unit.id,
        unitName: unit.name,
        session: sessionName,
        status,
        connected: status === "WORKING",
        qrCode,
        qrImage,
        message: status === "SCAN_QR_CODE"
          ? "Scan the QR code with WhatsApp on your phone. Use GET /:unitId/qr to refresh."
          : status === "WORKING"
            ? "Already connected!"
            : "Session is starting. Call GET /:unitId/status to check, then GET /:unitId/qr for QR code.",
      });
    }

    // ── GET /:unitId/qr → QR code (raw text for frontend rendering) ──
    if (action === "qr" && req.method === "GET") {
      try {
        const session = await waha.getSession(sessionName);

        if (session.status === "WORKING") {
          return jsonResponse({
            unitId: unit.id,
            session: sessionName,
            status: "WORKING",
            connected: true,
            message: "Already connected. No QR code needed.",
          });
        }

        if (session.status !== "SCAN_QR_CODE") {
          return jsonResponse({
            unitId: unit.id,
            session: sessionName,
            status: session.status,
            message: `Session is in ${session.status} status. Use POST /:unitId/connect first.`,
          });
        }

        const qr = await waha.getQrCode(sessionName);
        return jsonResponse({
          unitId: unit.id,
          session: sessionName,
          status: "SCAN_QR_CODE",
          qrCode: qr.value,
        });
      } catch {
        return errorResponse("Session not found. Use POST /:unitId/connect first.", 404);
      }
    }

    // ── GET /:unitId/qr-image → QR code as base64 PNG ────────────────
    if (action === "qr-image" && req.method === "GET") {
      try {
        const session = await waha.getSession(sessionName);

        if (session.status === "WORKING") {
          return jsonResponse({
            status: "WORKING",
            connected: true,
            message: "Already connected.",
          });
        }

        if (session.status !== "SCAN_QR_CODE") {
          return errorResponse(
            `Session is in ${session.status} status. Use POST /:unitId/connect first.`,
          );
        }

        const qrImage = await waha.getQrCodeImage(sessionName);
        return jsonResponse({
          unitId: unit.id,
          session: sessionName,
          status: "SCAN_QR_CODE",
          qrImage,
        });
      } catch {
        return errorResponse("Session not found. Use POST /:unitId/connect first.", 404);
      }
    }

    // ── POST /:unitId/disconnect → Logout (unpair WhatsApp) ──────────
    if (action === "disconnect" && req.method === "POST") {
      try {
        await waha.logoutSession(sessionName);
        await waha.stopSession(sessionName);

        structuredLog("info", "session_disconnect", {
          unitId: unit.id,
          session: sessionName,
        });

        return jsonResponse({
          unitId: unit.id,
          session: sessionName,
          status: "STOPPED",
          connected: false,
          message: "WhatsApp disconnected successfully.",
        });
      } catch (err) {
        return errorResponse(
          `Failed to disconnect: ${err instanceof Error ? err.message : String(err)}`,
          500,
        );
      }
    }

    // ── POST /:unitId/restart → Restart session ──────────────────────
    if (action === "restart" && req.method === "POST") {
      try {
        try {
          await waha.stopSession(sessionName);
        } catch {
          // May fail if already stopped
        }

        await waha.startSession(sessionName);

        // Wait for restart
        await new Promise((r) => setTimeout(r, 2000));

        const session = await waha.getSession(sessionName);

        structuredLog("info", "session_restart", {
          unitId: unit.id,
          session: sessionName,
          status: session.status,
        });

        return jsonResponse({
          unitId: unit.id,
          session: sessionName,
          status: session.status,
          connected: session.status === "WORKING",
          message: session.status === "WORKING"
            ? "Session restarted and connected."
            : session.status === "SCAN_QR_CODE"
              ? "Session restarted. Scan QR code again."
              : `Session restarted. Current status: ${session.status}`,
        });
      } catch (err) {
        return errorResponse(
          `Failed to restart: ${err instanceof Error ? err.message : String(err)}`,
          500,
        );
      }
    }

    // ── DELETE /:unitId/delete → Remove session permanently ──────────
    if (action === "delete" && req.method === "DELETE") {
      try {
        try {
          await waha.stopSession(sessionName);
        } catch {
          // May already be stopped
        }
        await waha.deleteSession(sessionName);

        structuredLog("info", "session_delete", {
          unitId: unit.id,
          session: sessionName,
        });

        return jsonResponse({
          unitId: unit.id,
          session: sessionName,
          status: "DELETED",
          connected: false,
          message: "Session deleted permanently.",
        });
      } catch (err) {
        return errorResponse(
          `Failed to delete: ${err instanceof Error ? err.message : String(err)}`,
          500,
        );
      }
    }

    // ── Unknown route ────────────────────────────────────────────────
    return errorResponse(
      `Unknown action: ${action ?? "(none)"}. ` +
      "Available: status, connect, qr, qr-image, disconnect, restart, delete",
      404,
    );
  } catch (error) {
    structuredLog("error", "session_management_error", {
      unitId,
      action,
      error: error instanceof Error ? error.message : String(error),
    });
    return errorResponse(
      error instanceof Error ? error.message : "Internal server error",
      500,
    );
  }
});
