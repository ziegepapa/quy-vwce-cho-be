import {readFileSync,writeFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import assert from "node:assert/strict";
const url="postgresql://postgres:postgres@127.0.0.1:54322/postgres";
assert.equal(process.env.GITHUB_ACTIONS,"true");
assert.equal(process.env.DB_URL,url);
const hosted=JSON.parse(readFileSync("docs/evidence/h5-hosted-catalog-2026-11-24.json","utf8"));
const local=JSON.parse(execFileSync("psql",[url,"-XAt","-v","ON_ERROR_STOP=1","-f","scripts/h5-schema-inventory.sql"],{encoding:"utf8"}));
const stable=v=>JSON.stringify(v,(_,x)=>x&&typeof x==="object"&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
const diff={};
for(const [key,rows] of Object.entries(hosted.inventory)){
 assert.ok(Array.isArray(rows)&&Array.isArray(local[key]),key);
 const h=new Set(rows.map(stable)),l=new Set(local[key].map(stable));
 diff[key]={hostedOnly:rows.filter(x=>!l.has(stable(x))),localOnly:local[key].filter(x=>!h.has(stable(x)))};
}
const history=execFileSync("psql",[url,"-XAt","-v","ON_ERROR_STOP=1","-c","select version from supabase_migrations.schema_migrations order by version"],{encoding:"utf8"}).trim().split("\n");
const drift=Object.values(diff).some(x=>x.hostedOnly.length||x.localOnly.length)||JSON.stringify(history)!==JSON.stringify(hosted.migrationHistory.map(x=>x.version));
assert.equal(local.tables.filter(x=>x[0]==="public"&&x[2]==="r").length,6);
writeFileSync("h5-catalog-diff.json",JSON.stringify({result:"PASS",parity:drift?"DRIFT":"MATCH",sourceCommit:process.env.SOURCE_COMMIT,run:process.env.GITHUB_RUN_ID,hostedCapturedOn:hosted.date,localHistory:history,hostedHistory:hosted.migrationHistory,diff},null,2)+"\n",{mode:0o600});
console.log("PASS: catalog comparison completed; parity="+(drift?"DRIFT":"MATCH"));
for(const [key,v] of Object.entries(diff))console.log(key+": hosted-only/changed="+v.hostedOnly.length+" local-only/changed="+v.localOnly.length);
