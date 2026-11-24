import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Local rehearsal only. No hosted invocation or real email is possible in MU3.
const endpoint = Deno.env.get("SUPABASE_URL");
const anon = Deno.env.get("SUPABASE_ANON_KEY");
const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const enabled = Deno.env.get("MU3_LOCAL_REHEARSAL") === "true" &&
  endpoint === "http://127.0.0.1:54321" && !!anon && !!service;
const origins = new Set(["http://127.0.0.1:4173", "http://127.0.0.1:5173"]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Identity = { id: string; email?: string; email_confirmed_at?: string; factors?: { status?: string }[]; user_metadata?: { display_name?: unknown } };
type Membership = { owner_user_id: string; member_user_id: string; role: string; status: string };
class Rejection extends Error { constructor(readonly status: number) { super("request rejected"); } }
async function api(path: string, token: string, init: RequestInit = {}, privileged = false) {
  const response = await fetch(endpoint + path, { ...init, headers: {
    apikey: privileged ? service! : anon!, Authorization: "Bearer " + token,
    "Content-Type": "application/json", Prefer: "return=representation",
  }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Rejection(response.status === 401 || response.status === 403 ? 403 : response.status === 409 ? 409 : 503);
  return await response.json();
}
const admin = (path: string, init?: RequestInit) => api(path, service!, init, true);
function filter(params: Record<string, string>) { return "?" + new URLSearchParams(params).toString(); }
const table = "/rest/v1/vault_memberships";
const fields = "owner_user_id,member_user_id,role,status";
const normalizedEmail = (email: string) => email.trim().toLowerCase();
async function scopedRows(token: string, owner: string): Promise<Membership[]> {
  return await api(table + filter({ select: fields, owner_user_id: "eq." + owner, order: "invited_at.asc", limit: "21" }), token);
}
async function caller(token: string): Promise<Identity> {
  const u = await api("/auth/v1/user", token) as Identity;
  if (!uuid.test(u?.id ?? "") || !u.email_confirmed_at || !u.email?.endsWith("@example.invalid")) throw new Rejection(403);
  // The JWT was verified by Auth above. Keep the existing MFA gate for privileged UI actions.
  const payload = token.split(".")[1];
  const claims = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "=")));
  if (u.factors?.some(f => f.status === "verified") && claims.aal !== "aal2") throw new Rejection(403);
  return u;
}
Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");
  const headers: Record<string,string> = { "Content-Type": "application/json", "Cache-Control": "no-store", "Vary": "Origin" };
  if (origin && origins.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Headers"] = "authorization,content-type";
    headers["Access-Control-Allow-Methods"] = "POST,OPTIONS";
  }
  const reply = (value: unknown, status = 200) => new Response(JSON.stringify(value), {status, headers});
  if (!enabled) return reply({ ok: false }, 503);
  if (origin && !origins.has(origin)) return reply({ ok: false }, 403);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return reply({ ok: false }, 405);
  const token = req.headers.get("Authorization")?.match(/^Bearer ([^ ]+)$/)?.[1];
  if (!token) return reply({ ok: false }, 401);
  try {
    const u = await caller(token);
    const raw = await req.text();
    if (raw.length > 2048) return reply({ ok: false }, 413);
    const body = JSON.parse(raw);
    if (!body || typeof body !== "object" || body.ownerId !== u.id) return reply({ ok: false }, 403);
    // MU3 is the two-account OWNER workspace, not a shared-admin UI.
    // An incoming read-only membership (even revoked) hides the management
    // surface; a different vault cannot be targeted by editing a request.
    const incoming = await api(table + filter({ select: "member_user_id", member_user_id: "eq." + u.id, role: "eq.member", limit: "1" }), token);
    if (!Array.isArray(incoming)) throw new Rejection(503);
    if (incoming.length) return reply({ ok: false }, 403);
    if (body.action === "list") {
      const rows = await scopedRows(token, u.id);
      if (!Array.isArray(rows) || rows.length > 20) throw new Rejection(503);
      const members = await Promise.all(rows.map(async row => {
        const response = await admin("/auth/v1/admin/users/" + row.member_user_id);
        const user = (response.user ?? response) as Identity;
        if (user.id !== row.member_user_id) throw new Rejection(503);
        const name = user.user_metadata?.display_name;
        return { id: row.member_user_id, email: user.email ?? "", name: typeof name === "string" ? name.slice(0, 120) : "", role: row.role, status: row.status };
      }));
      return reply({ ok: true, members });
    }
    if (body.action === "invite") {
      if (typeof body.email !== "string" || body.email.length > 254) return reply({ ok: false }, 400);
      const email = normalizedEmail(body.email);
      if (!/^[a-z0-9._%+\-]+@example\.invalid$/.test(email) || email === normalizedEmail(u.email!)) return reply({ ok: false }, 400);
      const rows = await scopedRows(token, u.id);
      if (rows.length >= 20) return reply({ ok: false }, 409);
      // Bounded Auth Admin lookup in the disposable two-account environment.
      // Real enrollment (including external email transport and acceptance) is a separate gate.
      const result = await admin("/auth/v1/admin/users?page=1&per_page=100");
      if (!Array.isArray(result.users) || result.users.length >= 100) throw new Rejection(503);
      let target = result.users.find((item: Identity) => item.email && normalizedEmail(item.email) === email) as Identity | undefined;
      if (!target) {
        // Auth Admin generateLink(type=invite) creates the invited identity
        // without delivering mail. Discard every link/token; never expose them.
        const generated = await admin("/auth/v1/admin/generate_link", { method: "POST", body: JSON.stringify({ type: "invite", email }) });
        target = (generated.user ?? generated) as Identity;
      }
      if (!target || !target.email || normalizedEmail(target.email) !== email || !uuid.test(target.id) || target.id === u.id) return reply({ ok: false }, 400);
      if (rows.some(row => row.member_user_id === target.id)) return reply({ ok: false }, 409);
      // Never accept a role or status from the browser. No activation/email.
      await admin(table, { method: "POST", body: JSON.stringify({ owner_user_id: u.id, member_user_id: target.id, role: "member", status: "invited" }) });
      return reply({ ok: true }, 201);
    }
    if (body.action === "revoke") {
      if (typeof body.memberId !== "string" || !uuid.test(body.memberId) || body.memberId === u.id) return reply({ ok: false }, 400);
      // Use the caller JWT, not the privileged key: MU2 RLS is the authority.
      const rows = await api(table + filter({ owner_user_id: "eq." + u.id, member_user_id: "eq." + body.memberId, status: "in.(invited,pending,active)" }), token,
        { method: "PATCH", body: JSON.stringify({ status: "revoked" }) });
      if (!Array.isArray(rows) || rows.length !== 1 || rows[0].status !== "revoked") return reply({ ok: false }, 409);
      return reply({ ok: true });
    }
    return reply({ ok: false }, 400);
  } catch (error) {
    return reply({ ok: false }, error instanceof Rejection ? error.status : error instanceof SyntaxError ? 400 : 503);
  }
});
