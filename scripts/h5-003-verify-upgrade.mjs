import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {writeFileSync,readFileSync,unlinkSync} from "node:fs";
import {join} from "node:path";
assert.equal(process.env.GITHUB_ACTIONS,"true");
assert.equal(process.env.DB_URL,"postgresql://postgres:postgres@127.0.0.1:54322/postgres");
const query=sql=>execFileSync("psql",[process.env.DB_URL,"-XAt","-v","ON_ERROR_STOP=1","-c",sql],{encoding:"utf8"}).trim();
const tables=["auth.users","auth.identities","public.profiles","public.app_settings","public.goals","public.transactions","public.annual_checklists","public.monthly_snapshots"];
const snapshot=Object.fromEntries(tables.map(t=>[t,query("select count(*),md5(coalesce(string_agg(to_jsonb(t)::text,chr(10) order by to_jsonb(t)::text),'')) from "+t+" t")]));
for(const [table,value] of Object.entries(snapshot))assert.equal(value.split("|")[0],table.startsWith("auth.")||table==="public.profiles"?"2":"4");
const path=join(process.env.RUNNER_TEMP,"h5-003-before.json");
if(process.argv[2]==="before"){assert.equal(query("select count(*) from supabase_migrations.schema_migrations where version='003'"),"0");writeFileSync(path,JSON.stringify(snapshot),{mode:0o600});console.log("PASS: 002 synthetic baseline fingerprints recorded");}
else if(process.argv[2]==="after"){assert.equal(query("select count(*) from supabase_migrations.schema_migrations where version='003'"),"1");assert.deepEqual(snapshot,JSON.parse(readFileSync(path,"utf8")));unlinkSync(path);writeFileSync("h5-003-upgrade-evidence.json",JSON.stringify({result:"PASS",sourceCommit:process.env.SOURCE_COMMIT,workflowRunId:process.env.GITHUB_RUN_ID,stage:"002 to 003",tables:8,engine:query("show server_version"),exactRowsPreserved:true},null,2)+"\n",{mode:0o600});console.log("PASS: 002 to 003 preserves exact rows on all eight identity/ledger tables");}
else throw Error("unknown stage");
