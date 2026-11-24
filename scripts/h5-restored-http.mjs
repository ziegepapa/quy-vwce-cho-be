import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {createClient} from "@supabase/supabase-js";
assert.equal(process.env.GITHUB_ACTIONS,"true");
assert.equal(process.env.DB_URL,"postgresql://postgres:postgres@127.0.0.1:54322/postgres");
const url=process.env.SUPABASE_URL;assert.equal(new URL(url).origin,"http://127.0.0.1:54321");
const opts={auth:{persistSession:false,autoRefreshToken:false}};
const users=JSON.parse(readFileSync(join(process.env.RUNNER_TEMP,"h5-full-credentials.json"),"utf8"));
assert.equal(users.length,2);
const clients=[];
for(const u of users){
 assert.ok(u.email.startsWith("h5-full-")&&u.email.endsWith("@example.invalid"));
 const c=createClient(url,process.env.SUPABASE_ANON_KEY,opts);
 const auth=await c.auth.signInWithPassword({email:u.email,password:u.password});
 assert.ok(!auth.error&&auth.data.session&&auth.data.user.id===u.uid,"restored Auth sign-in");
 clients.push(c);
}
const anon=createClient(url,process.env.SUPABASE_ANON_KEY,opts);
const denied=r=>Boolean(r.error&&["42501","PGRST301","PGRST302","401","403"].includes(String(r.error.code??r.error.status)));
const noRows=r=>denied(r)||(!r.error&&Array.isArray(r.data)&&r.data.length===0);
for(const [i,c] of clients.entries()){
 const own=users[i].uid,other=users[1-i].uid;
 const profile=await c.from("profiles").select("id").eq("id",own);
 assert.ok(!profile.error&&profile.data?.length===1,"own restored profile");
 assert.ok(noRows(await c.from("profiles").select("id").eq("id",other)),"cross profile denied");
 for(const t of ["app_settings","goals","transactions","annual_checklists","monthly_snapshots"]){
  const rows=await c.from(t).select("id,user_id,version,deleted_at,data").eq("user_id",own).order("id");
  assert.ok(!rows.error&&rows.data?.length===2,"restored own rows "+t);
  const live=rows.data.find(x=>x.id==="h5-live"),deleted=rows.data.find(x=>x.id==="h5-deleted");
  assert.ok(live?.version===8&&live.deleted_at===null&&live.data.synthetic===true&&live.data.kind==="updated","restored live "+t);
  assert.ok(deleted?.version===7&&deleted.deleted_at&&deleted.data.synthetic===true,"restored tombstone "+t);
  assert.ok(noRows(await c.from(t).select("id").eq("user_id",other)),"cross read "+t);
  assert.ok(noRows(await c.from(t).update({data:{forged:true}}).eq("user_id",other).select("id")),"cross update "+t);
  assert.ok(noRows(await c.from(t).delete().eq("user_id",other).select("id")),"cross delete "+t);
  assert.ok(denied(await c.from(t).insert({id:"h5-forged",user_id:other,data:{synthetic:true}})),"cross insert "+t);
  assert.ok(noRows(await anon.from(t).select("id")),"anonymous read "+t);
 }
}
for(const [i,c] of clients.entries())for(const t of ["app_settings","goals","transactions","annual_checklists","monthly_snapshots"]){
 const own=users[i].uid;
 const before=await c.from(t).select("id,version,data").eq("user_id",own).order("id");
 assert.ok(!before.error&&before.data?.length===2&&before.data.find(x=>x.id==="h5-live")?.version===8&&before.data.every(x=>x.data.synthetic===true),"cross attempts did not mutate "+t);
 const changed=await c.from(t).update({data:{id:"h5-live",synthetic:true,afterRecovery:true}}).eq("id","h5-live").eq("user_id",own).select("version");
 assert.ok(!changed.error&&changed.data?.[0]?.version===9,"owner post-restore write "+t);
}
console.log("PASS: both recovered accounts signed in with fresh JWT; own read/write, cross-user and anonymous denial across five sync tables");
