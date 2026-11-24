import assert from "node:assert/strict";
import {randomBytes} from "node:crypto";
import {writeFileSync} from "node:fs";
import {join} from "node:path";
import {createClient} from "@supabase/supabase-js";
assert.equal(process.env.GITHUB_ACTIONS,"true");
assert.equal(process.env.DB_URL,"postgresql://postgres:postgres@127.0.0.1:54322/postgres");
const url=process.env.SUPABASE_URL;
assert.equal(new URL(url).origin,"http://127.0.0.1:54321");
const opts={auth:{persistSession:false,autoRefreshToken:false}};
const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,opts);
const users=[];
const credentials=[];
const tables=["app_settings","goals","transactions","annual_checklists","monthly_snapshots"];
for(const suffix of ["a","b"]){
 const email="h5-full-"+suffix+"-"+randomBytes(8).toString("hex")+"@example.invalid";
 const password=randomBytes(24).toString("hex")+"Aa1!";
 const created=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{display_name:"synthetic H5 "+suffix}});
 assert.ok(!created.error&&created.data.user,"synthetic user create");
 const uid=created.data.user.id;assert.match(uid,/^[0-9a-f-]{36}$/);
 const client=createClient(url,process.env.SUPABASE_ANON_KEY,opts);
 const login=await client.auth.signInWithPassword({email,password});assert.ok(!login.error&&login.data.session,"synthetic user sign-in");
 users.push(uid);
 credentials.push({uid,email,password});
 for(const table of tables){
   for(const kind of ["live","deleted"]){
     const id="h5-"+kind;
     const result=await client.from(table).insert({id,user_id:uid,data:{id,synthetic:true,owner:suffix,kind},version:7,updated_at:"2001-01-02T00:00:00Z",created_at:"2001-01-01T00:00:00Z",deleted_at:kind==="deleted"?"2001-01-03T00:00:00Z":null}).select("id");
     assert.ok(!result.error&&result.data?.length===1,"owner insert "+table);
   }
   const changed=await client.from(table).update({data:{id:"h5-live",synthetic:true,owner:suffix,kind:"updated"}}).eq("id","h5-live").eq("user_id",uid).select("version");
   assert.ok(!changed.error&&changed.data?.[0]?.version===8,"version trigger "+table);
 }
}
writeFileSync(join(process.env.RUNNER_TEMP,"h5-full-users.json"),JSON.stringify(users),{mode:0o600});
writeFileSync(join(process.env.RUNNER_TEMP,"h5-full-credentials.json"),JSON.stringify(credentials),{mode:0o600});
console.log("PASS: two synthetic Auth users, profiles, 20 rows across all five sync tables; live/tombstone/version probes");
