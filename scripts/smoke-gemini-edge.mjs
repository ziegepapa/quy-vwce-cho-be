import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";

const port = 8794;
const api = "http://127.0.0.1:"+port;
const edge = "http://127.0.0.1:8000";
const userId = "00000000-0000-4000-8000-000000000999";
let requests = 0;
let paused = false;
let providerMode = "normal";
let calls = [];
let pauseCalls = 0;

function reply(res,status,body){
  res.writeHead(status,{"Content-Type":"application/json"});
  res.end(JSON.stringify(body));
}
async function body(req) {
  let raw="";
  for await(const chunk of req) raw+=chunk.toString();
  return JSON.parse(raw||"{}");
}
const stub = http.createServer(async(req,res)=>{
  try{
    if(req.url==="/auth/v1/user"){
      return req.headers.authorization==="Bearer mock-user-jwt" ? reply(res,200,{id:userId})
        : reply(res,401,{error:"unauthorized"});
    }
    if(req.url==="/rest/v1/rpc/gemini_explain_status"){
      assert.equal(req.headers.authorization,"Bearer mock-private-role");
      return reply(res,200,{ready:true,remaining:Math.max(0,10-requests)});
    }
    if(req.url==="/rest/v1/rpc/gemini_explain_claim"){
      assert.equal(req.headers.authorization,"Bearer mock-private-role");
      const params=await body(req);
      assert.equal(params.p_user_id,userId);
      if(paused || requests>=10) return reply(res,200,{allowed:false,reason:"user_limit"});
      requests++;
      return reply(res,200,{allowed:true,remaining:10-requests});
    }
    if(req.url==="/rest/v1/rpc/gemini_explain_pause"){
      assert.equal(req.headers.authorization,"Bearer mock-private-role");
      pauseCalls++;paused=true;
      return reply(res,200,{paused:true});
    }
    if(req.url?.startsWith("/v1beta/models/")){
      assert.equal(req.method,"POST");
      assert.equal(req.headers["x-goog-api-key"],"only-ci-not-real");
      assert.equal(req.headers.authorization,undefined);
      const msg=await body(req);
      calls.push({url:req.url,msg});
      if(providerMode==="rate") return reply(res,429,{error:"quota"});
      if(providerMode==="fallback" && req.url.includes("gemini-3.5")) return reply(res,503,{error:"unavailable"});
      const txt=providerMode==="unsafe" ? "Sie sollten im Jahr 2042 verkaufen.":
        "Nach den eingetragenen Zahlen wurde bisher ein Teil des Plans erreicht. Es ist keine Anlageberatung.";
      return reply(res,200,{candidates:[{content:{parts:[{text:txt}]}}]});
    }
    reply(res,404,{error:"no such endpoint"});
  }catch(e){reply(res,500,{error:e instanceof Error?e.message:"unknown"});}
});
await new Promise((resolve,reject)=>{stub.once("error",reject);stub.listen(port,"127.0.0.1",resolve);});
const deno=spawn("deno",["run","--allow-env","--allow-net","supabase/functions/gemini-vault-explain/index.ts"],{
  env:{...process.env,
    SUPABASE_URL:api,SUPABASE_ANON_KEY:"mock-public",
    SUPABASE_SERVICE_ROLE_KEY:"mock-private-role",
    GEMINI_ASSISTANT_ENABLED:"true",GEMINI_API_KEY:"only-ci-not-real",
    GEMINI_TEST_MODE:"1",GEMINI_TEST_API_BASE:api},
  stdio:["ignore","pipe","pipe"],
});
let logs="";
deno.stdout.on("data",x=>logs+=x.toString());
deno.stderr.on("data",x=>logs+=x.toString());
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function wait(){for(let i=0;i<100;i++){try{
  const r=await fetch(edge,{method:"OPTIONS",headers:{Origin:"http://localhost:5173"}});
  if(r.status===204)return;
}catch{}await sleep(150);}throw Error("Deno did not boot: "+logs.slice(-1800));}
const facts={
  portfolioValue:591.95,contributed:600,monthly:120,yearRecorded:600,yearPlanned:480,year:2026,
  goalAmount:null,goalYear:null,goalMode:null,simulationYear:2045,cautious:17000,base:24000,optimistic:32000,
};
const safe={schemaVersion:1,locale:"de",topic:"year",queryYear:null,facts};
async function call(input=safe, opts={}){
  return fetch(edge,{method:"POST",headers:{"Content-Type":"application/json",
    Origin:"http://localhost:5173",Authorization:"Bearer mock-user-jwt",...(opts.headers||{})},
    body:JSON.stringify(input)});
}
try{
  await wait();
  assert.equal((await fetch(edge,{method:"GET"})).status,401);
  assert.equal((await fetch(edge,{method:"GET",headers:{Origin:"https://untrusted.example"}})).status,403);
  const check=await fetch(edge,{method:"GET",headers:{Authorization:"Bearer mock-user-jwt"}});
  assert.equal(check.status,200);assert.equal((await check.json()).ready,true);
  assert.equal((await call({...safe,childName:"PRIVATE"})).status,400);
  assert.equal((await call({...safe,facts:{...facts,accountId:"SECRET ACCOUNT"}})).status,400);
  assert.equal(requests,0);
  let response=await call();
  assert.equal(response.status,200);
  const good=await response.json();
  assert.equal(good.remaining,9);
  assert.equal(calls.length,1);
  const serialized=JSON.stringify(calls[0].msg);
  for(const value of [userId,"mock-user-jwt","mock-private-role","PRIVATE","accountId","childName","localUserId"]){
    assert.ok(!serialized.includes(value),"Google must never see "+value);
  }
  assert.ok(serialized.includes("yearRecorded"));
  assert.ok(serialized.includes("600"));
  assert.ok(serialized.includes("Sie erklärst")===false); // no raw user question
  providerMode="fallback";calls=[];
  response=await call({...safe,topic:"simulation"});
  assert.equal(response.status,200);
  assert.equal(calls.length,2);
  assert.ok(calls[0].url.includes("gemini-3.5-flash-lite"));
  assert.ok(calls[1].url.includes("gemini-3.8-flash"));
  providerMode="unsafe";
  response=await call();
  assert.equal(response.status,503); // never display model-invented numbers or trading guidance
  providerMode="normal";
  for(let i=0;i<7;i++) assert.equal((await call()).status,200);
  assert.equal(requests,10);
  assert.equal((await call()).status,429);
  assert.equal(requests,10);
  // Mock the next UTC day: verify an upstream 429 trips the shared circuit
  // breaker, and no fallback is sent to a 2nd paid/limited model.
  requests=0;paused=false;calls=[];providerMode="rate";
  response=await call();
  assert.equal(response.status,429);
  assert.equal((await response.json()).code,"FREE_LIMIT");
  assert.equal(calls.length,1);
  assert.equal(pauseCalls,1);
  response=await call();
  assert.equal(response.status,429);
  assert.equal(calls.length,1);
  console.log("Gemini isolated smoke OK: auth, origin, readiness, zero-PII payload, fallback, unsafe answer, atomic quota stub and 429 circuit.");
}finally{
  deno.kill("SIGTERM");
  await new Promise(resolve=>stub.close(resolve));
}
