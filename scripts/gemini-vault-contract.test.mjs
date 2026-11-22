import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const server = readFileSync("supabase/functions/gemini-vault-explain/index.ts","utf8");
const sql = readFileSync("supabase/ops/gemini-explain-install.sql","utf8");
const client = readFileSync("src/components/GeminiVaultExplainer.tsx","utf8");
const facts = readFileSync("src/lib/geminiVaultFacts.ts","utf8");
const cache = readFileSync("src/lib/geminiVaultCache.ts","utf8");

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
  assert.ok(facts.includes("fixed, finance-safe intents"));
  assert.ok(server.includes("TOPIC_GUIDE_VI"));
  assert.ok(server.includes('"goalProgress"'));
  assert.ok(client.includes("gemini-vault-grounded"));
});
test("server checks actual auth and spends quota only after key/enable gate",()=>{
  assert.ok(server.includes('"/auth/v1/user"'));
  assert.ok(server.includes('gemini_explain_claim'));
  assert.ok(server.includes('gemini_explain_status'));
  assert.ok(server.includes('gemini_explain_pause'));
  assert.ok(server.includes("if (!active() || !serviceKey())"));
  assert.ok(server.includes("if (result.status === 429)"));
  assert.ok(sql.includes("pg_advisory_xact_lock"));
  assert.ok(sql.includes("attempts between 0 and 20"));
  assert.ok(sql.includes("if coalesce(v_user,0)>=20"));
  assert.ok(sql.includes("if coalesce(v_global,0)>=40"));
  assert.ok(server.includes("limitPerDay:20"));
  assert.ok(client.includes("Tối đa 20 lượt gửi/người/ngày UTC"));
  assert.ok(client.includes("limitPerDay - remaining"));
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
  assert.ok(client.includes("Google kann Free-Tier-Inhalte zur Produktverbesserung nutzen."));
});

test("AI answer cache stays on-device and prevents a second quota claim for identical facts",()=>{
  assert.ok(client.includes("geminiAnswerCacheKey(session.user.id, body)"));
  assert.ok(client.includes("readGeminiAnswer(key)"));
  assert.ok(client.includes("saveGeminiAnswer(key, clean, model)"));
  assert.ok(client.includes("if (saved)"));
  assert.ok(client.includes("No readiness probe, server quota claim or Google request"));
  assert.ok(client.includes("useEffect(() => { setAnswer(\"\"); setCached(false); }, [answerContext])"));
  assert.ok(cache.includes('crypto.subtle.digest("SHA-256"'));
  assert.ok(cache.includes("24 * 60 * 60 * 1000"));
  assert.ok(cache.includes("localStorage"));
  assert.doesNotMatch(cache,/GEMINI_API_KEY|SUPABASE_SERVICE_ROLE_KEY|x-goog-api-key|localStorage\.setItem\([^,]+,\s*JSON\.stringify\(request/);
});

test("only local ledger may conclude progress or difference, and old wrong AI cache is invalidated",()=>{
  assert.ok(client.includes('localTopic === "year" || localTopic === "difference" || localTopic === "goalProgress"'));
  assert.ok(client.includes("{!ledgerOnly && <button"));
  assert.ok(server.includes('code:"VAULT_ONLY"'));
  assert.ok(server.indexOf('code:"VAULT_ONLY"') < server.indexOf('gemini_explain_claim",{p_user_id:userId}'));
  assert.ok(server.includes("trăm|mươi|nghìn|ngàn|triệu"));
  assert.ok(cache.includes("vwce:gemini-cache:v3"));
  assert.ok(cache.includes("vwce:gemini-answer:v3:"));
});

test("standalone production SQL quota upgrade preserves data, row isolation, and shared cap",()=>{
  const upgrade=readFileSync("supabase/ops/gemini-explain-upgrade-20.sql","utf8");
  assert.ok(upgrade.includes("user_daily_attempts_check"));
  assert.ok(upgrade.includes("attempts between 0 and 20"));
  assert.ok(upgrade.includes("if coalesce(v_global,0)>=40"));
  assert.ok(upgrade.includes("pg_advisory_xact_lock"));
  assert.ok(upgrade.includes("remaining',19-coalesce"));
  assert.ok(upgrade.includes("greatest(0,20-coalesce"));
  assert.ok(upgrade.includes("revoke all on function public.gemini_explain_claim(uuid) from public, anon, authenticated"));
  assert.doesNotMatch(upgrade,/\b(?:truncate|delete from|drop table|update)\s+(?:public\.)?(?:transactions|goals|app_settings|user_daily)\b/i);
});

test("Flash shared budget is manual-only, atomic, RLS-protected, and server-only",()=>{
  const routing = readFileSync("supabase/ops/gemini-flash-routing-install.sql","utf8");
  assert.ok(routing.includes("MANUAL ONLY"));
  assert.ok(routing.includes("gemini_flash_daily"));
  assert.ok(routing.includes("check (attempts between 0 and 5)"));
  assert.ok(routing.includes("pg_advisory_xact_lock(911022,114)"));
  assert.ok(routing.includes("enable row level security"));
  assert.ok(routing.includes("revoke all on function public.gemini_flash_claim() from public, anon, authenticated"));
  assert.ok(routing.includes("grant execute on function public.gemini_flash_claim() to service_role"));
  assert.ok(routing.includes("gemini_reply_cache_get"));
  assert.ok(routing.includes("gemini_reply_cache_put"));
  assert.ok(routing.includes("interval '24 hours'"));
  assert.ok(routing.includes("primary key (user_id, cache_key)"));
  assert.ok(routing.includes("'^[0-9a-f]{64}$'"));
  assert.doesNotMatch(routing,/\b(?:create trigger|create extension|create policy|pg_cron|cron\.schedule|alter table public\.|auth\.users|truncate)\b/i);
});
test("authenticated Edge uses cache before spending 20/40 Vault quota and reserves Flash per attempt",()=>{
  const cacheGet=server.indexOf('"gemini_reply_cache_get"');
  const appClaim=server.indexOf('"gemini_explain_claim"');
  assert.ok(cacheGet>=0 && appClaim>cacheGet);
  assert.ok(server.includes('serverCacheHash(payload)'));
  assert.ok(server.includes("payload.topic,payload.locale,payload.facts,payload.queryYear"));
  assert.ok(server.includes('payload.topic === "goal" || payload.topic === "simulation"'));
  assert.ok(server.includes('gemini_flash_claim'));
  assert.ok(server.includes("if (model === flash && !reservedPrimary && !(await reserveFlash(base,role)))"));
  assert.ok(server.includes('if (result.status === 429)'));
  assert.ok(server.includes('"gemini_explain_pause"'));
  assert.ok(server.includes('gemini_reply_cache_put'));
  assert.ok(server.includes("model,cached:false"));
  assert.ok(server.includes("cached:true"));
  assert.doesNotMatch(server,/GEMINI_TEST_API_BASE[^]*?\:generateContent/); // CI override is isolated in the helper only
});
test("PWA shows provider-confirmed model (including device cache hits) without leaking secrets",()=>{
  assert.ok(client.includes('data-testid="gemini-vault-model"'));
  assert.ok(client.includes('modelLabel: "Modell"'));
  assert.ok(client.includes('modelLabel: "Mô hình"'));
  assert.ok(client.includes('readGeminiModel(key)'));
  assert.ok(client.includes('saveGeminiAnswer(key, clean, model)'));
  assert.ok(cache.includes('vwce:gemini-cache:v3'));
  assert.ok(cache.includes("gemini-3.8-flash"));
  assert.ok(cache.includes("gemini-3.5-flash-lite"));
  assert.ok(server.includes('"goalProgress"')); // Preserve the existing 8-topic contract.
  assert.ok(server.includes('code:"VAULT_ONLY"')); // Preserve factual safeguards.
});
