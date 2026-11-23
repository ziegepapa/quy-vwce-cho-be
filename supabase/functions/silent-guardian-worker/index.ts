import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Server-to-server endpoint only; caller must present a one-time 256-bit ticket
// minted by a restricted pg_cron job. No user JWTs or PWA calls accepted.
const jsonHeaders = { "Content-Type": "application/json", "Cache-Control": "no-store" };
function reply(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: jsonHeaders });
}

function secretApiKey(): string | undefined {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  // Future projects may use named secret keys, injected by Supabase automatically.
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (!raw) return undefined;
  try {
    const refs = JSON.parse(raw) as Record<string, string>;
    return Deno.env.get(refs.default || "") || undefined;
  } catch { return undefined; }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return reply({ ok: false, error: "POST only" }, 405);
  if (Number(req.headers.get("content-length") || 0) > 512) return reply({ ok: false }, 413);
  let ticket: unknown;
  try {
    const body = await req.text();
    if (body.length > 512) return reply({ ok: false }, 413);
    ticket = JSON.parse(body)?.token;
  } catch { return reply({ ok: false }, 400); }
  if (typeof ticket !== "string" || !/^[a-f0-9]{64}$/.test(ticket)) {
    return reply({ ok: false, error: "Ticket required" }, 401);
  }
  const endpoint = Deno.env.get("SUPABASE_URL");
  const serviceKey = secretApiKey();
  if (!endpoint || !serviceKey) return reply({ ok: false, error: "Server unavailable" }, 503);

  async function rpc(name: string, payload: unknown): Promise<unknown> {
    const response = await fetch(endpoint + "/rest/v1/rpc/" + name, {
      method: "POST",
      headers: {
        apikey: serviceKey!,
        Authorization: "Bearer " + serviceKey!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("Backend RPC rejected: " + response.status);
    return await response.json();
  }

  let claim: { accepted?: boolean; action?: string; kind?: string; delivery_id?: string; status?: string };
  try {
    claim = await rpc("guardian_worker_claim", { p_token: ticket }) as typeof claim;
  } catch (err) {
    console.error("Guardian claim failed", err instanceof Error ? err.message : "unknown");
    return reply({ ok: false, error: "Backend unavailable" }, 503);
  }
  if (!claim?.accepted) return reply({ ok: false, error: "Ticket invalid or expired" }, 401);
  if (claim.action !== "send") return reply({ ok: true, action: "noop", status: claim.status || "suppressed" });
  if (!claim.delivery_id || (claim.kind !== "alert" && claim.kind !== "selftest")) {
    return reply({ ok: false, error: "Invalid work item" }, 503);
  }

  const key = Deno.env.get("RESEND_API_KEY");
  const to = Deno.env.get("RESEND_TEST_TO");
  if (!key || !to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    // Never send if keys or recipient are not configured.
    return reply({ ok: false, error: "Email configuration incomplete" }, 503);
  }
  const selftest = claim.kind === "selftest";
  const body = selftest
    ? "VWCE Vault Silent Guardian: Der geplante Server-Check und der E-Mail-Kanal wurden erfolgreich getestet. Es wurden keine Depotdaten verändert. Automatische Warnungen sind hiervon unabhängig."
    : "VWCE Vault Silent Guardian: Bei mindestens zwei aufeinanderfolgenden Server-Prüfungen wurden strukturelle Auffälligkeiten festgestellt. Bitte den Vault und die Synchronisierung prüfen. Dies ist weder ein Broker-Abgleich noch ein Beleg für fehlende Einzahlungen. Es wurden keine Depotdaten verändert.";
  let accepted = false;
  let providerId: string | null = null;
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + key,
        "Content-Type": "application/json",
        "Idempotency-Key": "vwce-guardian-" + claim.delivery_id,
      },
      body: JSON.stringify({
        from: "VWCE Vault Guardian <onboarding@resend.dev>",
        to: [to],
        subject: selftest ? "VWCE Vault — Silent Guardian Server-Test" : "VWCE Vault — Silent Guardian Warnung",
        text: body,
      }),
      signal: AbortSignal.timeout(15000),
    });
    accepted = response.ok;
    const data = await response.json().catch(() => ({}));
    providerId = accepted && typeof data?.id === "string" ? data.id : null;
    if (!accepted) console.error("Guardian mail rejected", response.status);
  } catch {
    console.error("Guardian mail provider unavailable");
  }
  try {
    await rpc("guardian_worker_finish", {
      p_delivery_id: claim.delivery_id, p_ok: accepted, p_provider_id: providerId,
    });
  } catch {
    // Keep the reserved state if acknowledgement fails: fail closed on
    // duplicates, even if Resend has already accepted the email.
    console.error("Guardian mail outcome unconfirmed");
    return reply({ ok: false, error: "Acknowledgement unavailable" }, 503);
  }
  return reply({ ok: accepted, action: selftest ? "selftest" : "alert", acceptedByResend: accepted }, accepted ? 200 : 502);
});
