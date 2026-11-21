import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { auditGuardianSnapshot } from "../_shared/silentGuardianAudit.mjs";

// This endpoint is a manual, read-only checkpoint for the signed-in owner.
// It intentionally has no Resend access, service-role credential or write operations.
const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };
function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "GET") return json({ ok: false, error: "GET required" }, 405);
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_ANON_KEY");
  const auth = req.headers.get("Authorization") ?? "";
  if (!url || !key) return json({ ok: false, error: "Server configuration unavailable" }, 503);
  if (!/^Bearer[ ]+[^ ]+$/i.test(auth)) return json({ ok: false, error: "Sign-in required" }, 401);

  const apiKey: string = key;

  try {
    // Do not trust the caller-supplied user_id. Verify the token against Auth.
    const response = await fetch(url + "/auth/v1/user", {
      headers: { Authorization: auth, apikey: apiKey },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return json({ ok: false, error: "Sign-in required" }, 401);
    const identity = await response.json();
    if (typeof identity?.id !== "string" || !/^[a-f0-9-]{36}$/i.test(identity.id)) {
      return json({ ok: false, error: "Sign-in required" }, 401);
    }
    const userId: string = identity.id;

    async function load(domain: string) {
      const query = new URLSearchParams({ select: "id,data,deleted_at", user_id: "eq." + userId, limit: "1000" });
      const result = await fetch(url + "/rest/v1/" + domain + "?" + query, {
        headers: { Authorization: auth, apikey: apiKey, Accept: "application/json" },
        signal: AbortSignal.timeout(10000),
      });
      if (!result.ok) throw new Error("Database read blocked: " + domain + ":" + result.status);
      const rows = await result.json();
      if (!Array.isArray(rows)) throw new Error("Unexpected data response");
      return rows;
    }

    const [transactions, goals, app_settings] = await Promise.all([
      load("transactions"), load("goals"), load("app_settings"),
    ]);
    const audit = auditGuardianSnapshot({ transactions, goals, app_settings });
    return json({
      ok: true, mode: "read_only", notificationsEnabled: false,
      checkedAt: new Date().toISOString(), ...audit,
    });
  } catch (error) {
    // No row data, secrets, or credentials in logs/responses.
    console.error("Guardian read-only audit failed", error instanceof Error ? error.message : "unknown");
    return json({ ok: false, error: "Read-only check unavailable" }, 503);
  }
});
