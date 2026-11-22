import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const server = readFileSync("supabase/functions/gemini-vault-explain/index.ts","utf8");
const sql = readFileSync("supabase/ops/gemini-explain-install.sql","utf8");
const client = readFileSync("src/components/GeminiVaultExplainer.tsx","utf8");
const facts = readFileSync("src/lib/geminiVaultFacts.ts","utf8");

test("Gemini key and service role cannot enter PWA or GitHub source literals",()=>{
  assert.ok(server.includes('Deno.env.get("GEMINI_API_KEY")'));
  assert.ok(server.includes('Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")'));
  assert.doesNotMatch(client,/GEMINI_API_KEY|SUPABASE_SERVICE_ROLE_KEY|x-goog-api-key/);
  assert.doesNotMatch(facts,/GEMINI_API_KEY|SUPABASE_SERVICE_ROLE_KEY|x-goog-api-key/);
  assert.doesNotMatch(server,/(?:AIza[0-9A-Za-z_-]{25,}|sb_secret_[A-Za-z0-9]+)/);
  assert.ok(server.includes('GEMINI_ASSISTANT_ENABLED'));
  assert.ok(server.includes("GEMINI_TEST_MODE"));
});
test("provider receives only numeric facts and fixed enum topics, never raw questions or identity",()=>{
  assert.match(server,/JSON\.stringify\(\{\s*topic: payload\.topic, requestedYear: payload\.queryYear, facts: payload\.facts/);
  assert.doesNotMatch(server,/JSON\.stringify\(\{[^}]*userId[^}]*facts/);
  assert.ok(server.includes("Object.keys(v.facts).some"));
  assert.ok(server.includes("MAX_BODY = 1800"));
  assert.ok(server.includes("if (!payload) return json(req,400"));
  assert.ok(facts.includes("only a tiny set of"));
});
test("server checks actual auth and spends quota only after key/enable gate",()=>{
  assert.ok(server.includes('"/auth/v1/user"'));
  assert.ok(server.includes('gemini_explain_claim'));
  assert.ok(server.includes('gemini_explain_status'));
  assert.ok(server.includes('gemini_explain_pause'));
  assert.ok(server.includes("if (!active() || !serviceKey())"));
  assert.ok(server.includes("if (result.status === 429)"));
  assert.ok(sql.includes("pg_advisory_xact_lock"));
  assert.ok(sql.includes("attempts between 0 and 10"));
  assert.ok(sql.includes("attempts between 0 and 40"));
  assert.ok(sql.includes("grant execute on function public.gemini_explain_claim(uuid) to service_role"));
  assert.ok(sql.includes("revoke all on function public.gemini_explain_claim(uuid) from public, anon, authenticated"));
  assert.ok(sql.includes("enable row level security"));
  assert.doesNotMatch(sql,/\b(?:alter|update|delete|truncate)\s+(?:table\s+)?(?:public\.)?(?:transactions|goals|app_settings)\b/i);
});
test("no Google requests on mount, no raw question sent, consent required",()=>{
  assert.ok(client.includes("onClick={()=>void ask()}"));
  assert.ok(client.includes("!consent"));
  assert.ok(client.includes("classifyGeminiQuestion"));
  assert.ok(client.includes("facts:selectedFacts"));
  assert.doesNotMatch(client,/body:\s*\{[^}]*question\s*[,}]/);
  assert.ok(client.includes("gemini-vault-explain"));
  assert.ok(client.includes("Google-Produkte zu verbessern"));
});
