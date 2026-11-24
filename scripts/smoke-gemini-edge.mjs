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
let modelChecks = 0;
let flashAttempts = 0;
let cacheEnabled = false;
const serverCache = new Map();
let cacheGetCalls = 0;

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
      return reply(res,200,{ready:true,remaining:Math.max(0,20-requests)});
    }
    if(req.url==="/rest/v1/rpc/gemini_explain_claim"){
      assert.equal(req.headers.authorization,"Bearer mock-private-role");
      const params=await body(req);
      assert.equal(params.p_user_id,userId);
      if(paused || requests>=20) return reply(res,200,{allowed:false,reason:"user_limit"});
      requests++;
      return reply(res,200,{allowed:true,remaining:20-requests});
    }
    if(req.url==="/rest/v1/rpc/gemini_flash_claim"){
      assert.equal(req.headers.authorization,"Bearer mock-private-role");
      if(flashAttempts>=5) return reply(res,200,{allowed:false,remaining:0});
      flashAttempts++;
      return reply(res,200,{allowed:true,remaining:5-flashAttempts});
    }
    if(req.url==="/rest/v1/rpc/gemini_reply_cache_get"){
      assert.equal(req.headers.authorization,"Bearer mock-private-role");
      const p=await body(req);cacheGetCalls++;
      assert.equal(p.p_user_id,userId);
      assert.match(p.p_cache_key,/^[a-f0-9]{64}$/);
      const item=cacheEnabled?serverCache.get(p.p_user_id+":"+p.p_cache_key):null;
      return reply(res,200,item?{hit:true,...item}:{hit:false});
    }
    if(req.url==="/rest/v1/rpc/gemini_reply_cache_put"){
      assert.equal(req.headers.authorization,"Bearer mock-private-role");
      const p=await body(req);
      assert.equal(p.p_user_id,userId);
      if(cacheEnabled) serverCache.set(p.p_user_id+":"+p.p_cache_key,{
        explanation:p.p_explanation,model:p.p_model,
      });
      return reply(res,200,{stored:true});
    }
    if(req.url==="/rest/v1/rpc/gemini_explain_pause"){
      assert.equal(req.headers.authorization,"Bearer mock-private-role");
      pauseCalls++;paused=true;
      return reply(res,200,{paused:true});
    }
    if(req.url?.startsWith("/v1beta/models/")){
      if(req.method==="GET"){
        modelChecks++;
        assert.equal(req.headers["x-goog-api-key"],"only-ci-not-real");
        assert.equal(req.headers.authorization,undefined);
        if(providerMode==="key") return reply(res,403,{error:"forbidden"});
        if(providerMode==="aq-rejected") return reply(res,401,{error:{status:"UNAUTHENTICATED",message:"must-not-log-provider-message",details:[{reason:"ACCESS_TOKEN_TYPE_UNSUPPORTED"}]}});
        return reply(res,200,{name:req.url,supportedGenerationMethods:["generateContent"]});
      }
      assert.equal(req.method,"POST");
      assert.equal(req.headers["x-goog-api-key"],"only-ci-not-real");
      assert.equal(req.headers.authorization,undefined);
      const msg=await body(req);
      calls.push({url:req.url,msg,socket:req.socket});
      if(providerMode==="rate") return reply(res,429,{error:"quota"});
      if(providerMode==="overloaded") return reply(res,503,{error:"unavailable"});
      if(providerMode==="empty") return reply(res,200,{candidates:[{content:{parts:[]},finishReason:"MAX_TOKENS"}]});
      if(providerMode==="spoken-numbers") return reply(res,200,{candidates:[{content:{parts:[{text:"Số đã ghi năm trăm sáu mươi, đạt mức sáu trăm."}]}}]});
      if(providerMode==="fallback" && req.url.includes("gemini-3.5")) return reply(res,503,{error:"unavailable"});
      if(providerMode==="lite404" && req.url.includes("gemini-3.5")) return reply(res,404,{error:"missing"});
      if(providerMode==="flash503" && req.url.includes("gemini-3.8")) return reply(res,503,{error:"unavailable"});
      if(providerMode==="flash404" && req.url.includes("gemini-3.8")) return reply(res,404,{error:"missing"});
      if(["slow-lite","timeout-lite","body-timeout-lite"].includes(providerMode) && req.url.includes("gemini-3.8")) return reply(res,503,{error:"unavailable"});
      if(providerMode==="slow-lite") await sleep(13000); // Actual > old 12s deadline, < new 25s.
      if(providerMode==="timeout-lite" || providerMode==="timeout-flash") return; // No headers until client aborts.
      if(providerMode==="body-timeout-lite") {
        res.writeHead(200,{"Content-Type":"application/json"});res.flushHeaders();res.write("{");return;
      }
      // Reset AFTER consuming the POST, BEFORE any response headers. A replay
      // would reach this stub again and consume real provider quota in production.
      if(providerMode==="network-flash") {res.destroy();return;}
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
    GEMINI_ASSISTANT_ENABLED:"true",GEMINI_API_KEY:"only-ci-not-real \n",
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
const safe={schemaVersion:1,locale:"de",topic:"plan",queryYear:null,facts};
const goalFacts={...facts,goalAmount:10000,goalYear:2038,goalMode:"nominal"};
async function call(input=safe, opts={}){
  return fetch(edge,{method:"POST",headers:{"Content-Type":"application/json",
    Origin:"http://localhost:5173",Authorization:"Bearer mock-user-jwt",...(opts.headers||{})},
    body:JSON.stringify(input)});
}
try{
  await wait();
  assert.equal((await fetch(edge,{method:"GET"})).status,401);
  assert.equal((await fetch(edge,{method:"GET",headers:{Origin:"https://untrusted.example"}})).status,403);
  const check=await fetch(edge,{method:"GET",headers:{Authorization:"Bearer mock-user-jwt","x-gemini-check":"1"}});
  assert.equal(check.status,200);
  const checkData=await check.json();
  assert.equal(checkData.ready,true);
  assert.equal(checkData.limitPerDay,20);
  assert.equal(checkData.modelChecks.length,2);
  assert.equal(modelChecks,2);
  assert.equal(requests,0);
  assert.equal(flashAttempts,0);
  providerMode="key";
  const blocked=await fetch(edge,{method:"GET",headers:{Authorization:"Bearer mock-user-jwt","x-gemini-check":"1"}});
  assert.equal(blocked.status,200);
  assert.equal((await blocked.json()).ready,false);
  assert.equal(requests,0);
  providerMode="aq-rejected";
  const authDenied=await fetch(edge,{method:"GET",headers:{Authorization:"Bearer mock-user-jwt","x-gemini-check":"1"}});
  assert.equal(authDenied.status,200);
  assert.deepEqual((await authDenied.json()).modelChecks.map(x=>x.status),[401,401]);
  assert.equal(requests,0);
  await sleep(20);
  assert.ok(logs.includes("ACCESS_TOKEN_TYPE_UNSUPPORTED"),"log should explain an auth-key rejection");
  assert.ok(logs.includes('"keyWhitespace":true'),"secret whitespace must be detected safely");
  for(const secret of ["only-ci-not-real","must-not-log-provider-message","mock-user-jwt"]){
    assert.ok(!logs.includes(secret),"provider probe must not log "+secret);
  }
  providerMode="normal";
  assert.equal((await call({...safe,childName:"PRIVATE"})).status,400);
  assert.equal((await call({...safe,facts:{...facts,accountId:"SECRET ACCOUNT"}})).status,400);
  // Missing Goal never reaches Google or consumes a SQL quota reservation.
  const missingGoal=await call({...safe,topic:"goal"});
  assert.equal(missingGoal.status,400);
  assert.equal((await missingGoal.json()).code,"GOAL_REQUIRED");
  assert.equal(requests,0);
  let response=await call();
  assert.equal(response.status,200);
  const good=await response.json();
  assert.equal(good.remaining,19);
  assert.equal(calls.length,1);
  const serialized=JSON.stringify(calls[0].msg);
  for(const value of [userId,"mock-user-jwt","mock-private-role","PRIVATE","accountId","childName","localUserId"]){
    assert.ok(!serialized.includes(value),"Google must never see "+value);
  }
  assert.ok(serialized.includes("yearRecorded"));
  assert.ok(serialized.includes("600"));
  assert.ok(serialized.includes("Sie erklärst")===false); // no raw user question
  providerMode="fallback";calls=[];
  response=await call({...safe,topic:"plan"});
  assert.equal(response.status,200);
  assert.equal(calls.length,2);
  assert.ok(calls[0].url.includes("gemini-3.5-flash-lite"));
  assert.ok(calls[1].url.includes("gemini-3.8-flash"));
  assert.equal(flashAttempts,1);
  providerMode="unsafe";
  response=await call();
  assert.equal(response.status,422); // unsafe output must never be displayed
  assert.equal((await response.json()).code,"AI_RESPONSE_REJECTED");
  providerMode="spoken-numbers";
  response=await call({...safe,locale:"vi"});
  assert.equal(response.status,422);
  assert.equal((await response.json()).code,"AI_RESPONSE_REJECTED");
  providerMode="empty";
  response=await call();
  assert.equal(response.status,502);
  assert.equal((await response.json()).code,"AI_EMPTY_OUTPUT");
  providerMode="overloaded";
  calls=[];response=await call();
  assert.equal(response.status,503);
  assert.equal((await response.json()).code,"GOOGLE_OVERLOADED");
  assert.equal(calls.length,2);
  providerMode="normal";
  for(let i=0;i<14;i++) assert.equal((await call()).status,200);
  assert.equal(requests,20);
  assert.equal((await call()).status,429);
  assert.equal(requests,20);
  // Next mocked UTC day: exact comparisons are handled by Vault, never Gemini.
  requests=0;paused=false;calls=[];providerMode="normal";
  for (const topic of ["plan","goal","simulation","value","monthly"]) {
    response=await call({...safe,topic,facts:topic==="goal"?goalFacts:facts});
    assert.equal(response.status,200);
    const posted=JSON.parse(calls[calls.length-1].msg.contents[0].parts[0].text);
    assert.equal(posted.topic,topic);
    assert.equal(Object.keys(posted).sort().join(","),"facts,requestedYear,topic");
    assert.ok(calls[calls.length-1].msg.systemInstruction.parts[0].text.length>100);
  }
  assert.equal(requests,5);
  // Factual comparisons cannot reach the model or spend quota, even on old clients.
  for (const topic of ["year","difference","goalProgress"]) {
    response=await call({...safe,topic,facts:topic==="goal"?goalFacts:facts});
    assert.equal(response.status,400);
    assert.equal((await response.json()).code,"VAULT_ONLY");
  }
  assert.equal(requests,5);
  // Invalid new topics do not consume quota.
  assert.equal((await call({...safe,topic:"unsafe_free_text"})).status,400);
  assert.equal(requests,5);
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
  // Model-choice: the 3 exact arithmetic intents remain Vault-only.
  requests=0;paused=false;calls=[];flashAttempts=0;providerMode="normal";
  for (const [topic,model] of [
    ["goal","gemini-3.8-flash"],["simulation","gemini-3.8-flash"],
    ["plan","gemini-3.5-flash-lite"],["value","gemini-3.5-flash-lite"],
    ["monthly","gemini-3.5-flash-lite"],
  ]) {
    const before=calls.length;
    response=await call({...safe,topic,facts:topic==="goal"?goalFacts:facts});
    assert.equal(response.status,200);
    const data=await response.json();
    assert.equal(data.model,model);
    assert.equal(calls.length,before+1);
    assert.ok(calls.at(-1).url.includes(model));
  }
  assert.equal(flashAttempts,2);
  assert.equal(requests,5);

  // Exhaust Flash budget without touching Google again after the fifth attempt.
  requests=0;paused=false;calls=[];flashAttempts=0;providerMode="normal";
  for(let i=0;i<6;i++){
    const data=await (await call({...safe,topic:"goal",facts:{...goalFacts,contributed:600+i}})).json();
    assert.equal(data.model,i<5?"gemini-3.8-flash":"gemini-3.5-flash-lite");
  }
  assert.equal(flashAttempts,5);
  assert.equal(calls.filter(x=>x.url.includes("gemini-3.8-flash")).length,5);
  assert.equal(requests,6);

  // Lite 404 and 503 each use exactly one Flash attempt (if capacity remains).
  for(const mode of ["lite404","fallback"]){
    requests=0;paused=false;calls=[];flashAttempts=0;providerMode=mode;
    response=await call({...safe,topic:"plan"});
    assert.equal(response.status,200);
    assert.equal((await response.json()).model,"gemini-3.8-flash");
    assert.equal(calls.length,2);
    assert.ok(calls[0].url.includes("gemini-3.5-flash-lite"));
    assert.ok(calls[1].url.includes("gemini-3.8-flash"));
    assert.equal(flashAttempts,1);
  }
  // Flash 404/503: one Lite fallback, no additional Flash reserve.
  for(const mode of ["flash404","flash503"]){
    requests=0;paused=false;calls=[];flashAttempts=0;providerMode=mode;
    response=await call({...safe,topic:"simulation"});
    assert.equal(response.status,200);
    assert.equal((await response.json()).model,"gemini-3.5-flash-lite");
    assert.equal(calls.length,2);
    assert.ok(calls[0].url.includes("gemini-3.8-flash"));
    assert.ok(calls[1].url.includes("gemini-3.5-flash-lite"));
    assert.equal(flashAttempts,1);
  }
  // Budget already exhausted: Lite 503 cannot try Flash without a reservation.
  requests=0;paused=false;calls=[];flashAttempts=5;providerMode="fallback";
  response=await call({...safe,topic:"plan"});
  assert.equal(response.status,503);
  assert.equal(calls.length,1);
  assert.equal(flashAttempts,5);

  // Cache only 200: exact payload hit must bypass both daily counters and Google.
  requests=0;paused=false;calls=[];flashAttempts=0;providerMode="normal";
  cacheEnabled=true;serverCache.clear();
  response=await call({...safe,topic:"goal",facts:goalFacts});
  assert.equal(response.status,200);
  assert.equal((await response.json()).model,"gemini-3.8-flash");
  assert.equal(requests,1);assert.equal(flashAttempts,1);
  response=await call({...safe,topic:"goal",facts:goalFacts});
  assert.equal(response.status,200);
  const cached=await response.json();
  assert.equal(cached.cached,true);
  assert.equal(cached.model,"gemini-3.8-flash");
  assert.equal(requests,1);assert.equal(flashAttempts,1);assert.equal(calls.length,1);
  response=await call({...safe,topic:"goal",facts:{...goalFacts,contributed:601}});
  assert.equal(response.status,200);assert.equal((await response.json()).cached,false);
  assert.equal(requests,2);assert.equal(flashAttempts,2);
  response=await call({...safe,topic:"goal",queryYear:2038,facts:goalFacts});
  assert.equal(response.status,200);
  assert.equal(requests,3);assert.equal(flashAttempts,3);

  // No failed response may be served from cache on the next request.
  serverCache.clear();requests=0;paused=false;calls=[];flashAttempts=0;
  providerMode="spoken-numbers";
  assert.equal((await call({...safe,topic:"plan"})).status,422);
  assert.equal(serverCache.size,0);
  providerMode="normal";
  assert.equal((await call({...safe,topic:"plan"})).status,200);
  assert.equal(requests,2);

  // A provider 429 on primary Flash pauses the whole service, no Lite fallback.
  cacheEnabled=false;serverCache.clear();
  requests=0;paused=false;calls=[];flashAttempts=0;providerMode="rate";
  const pauseBefore=pauseCalls;
  response=await call({...safe,topic:"goal",facts:goalFacts});
  assert.equal(response.status,429);
  assert.equal((await response.json()).code,"FREE_LIMIT");
  assert.equal(calls.length,1);
  assert.ok(calls[0].url.includes("gemini-3.8-flash"));
  assert.equal(flashAttempts,1);
  assert.equal(pauseCalls,pauseBefore+1);
  response=await call({...safe,topic:"plan"});
  assert.equal(response.status,429);
  assert.equal(calls.length,1);
  // Lite 429 has identical fail-closed behavior, without any Flash reservation.
  requests=0;paused=false;calls=[];flashAttempts=0;providerMode="rate";
  response=await call({...safe,topic:"plan"});
  assert.equal(response.status,429);
  assert.equal(calls.length,1);
  assert.equal(flashAttempts,0);
  // Flash generation logs must contain only genuine upstream HTTP error codes.
  // Lite failures, valid Flash replies and local rejected/empty outputs are not Google HTTP errors.
  await sleep(100);
  const flashDiagnostics=logs.split(/\r?\n/).filter(line=>line.includes("[gemini-flash-google-http]"));
  assert.deepEqual(flashDiagnostics.map(line=>{
    const m=line.match(/^\[gemini-flash-google-http\] (\d{3})$/);
    assert.ok(m,"Flash log must be a fixed marker and HTTP integer only");
    return Number(m[1]);
  }).sort((a,b)=>a-b),[404,429,503,503]); // Primary Flash 503 plus Flash fallback 503 after Lite overload.
  for(const secret of [userId,"mock-user-jwt","mock-private-role","only-ci-not-real","591.95","17000"]){
    assert.ok(!flashDiagnostics.join("\n").includes(secret),"Flash diagnostics must not contain identity, data or secrets");
  }
  // Confirm generation requests never reuse the previous socket. Keep the
  // abrupt reset test below strict at one actual POST, not just one log entry.
  requests=0;paused=false;calls=[];flashAttempts=0;providerMode="normal";
  assert.equal((await call({...safe,topic:"goal",facts:goalFacts})).status,200);
  assert.equal((await call({...safe,topic:"goal",facts:goalFacts})).status,200);
  assert.equal(calls.length,2);assert.notEqual(calls[0].socket,calls[1].socket);
  assert.equal(requests,2);assert.equal(flashAttempts,2);
  // Production deadline tests: real durations, no test-only timeout override.
  for(const [mode,expected,status,count] of [
    ["slow-lite","gemini-3.5-flash-lite",200,2],
    ["timeout-lite","GOOGLE_TIMEOUT",503,2],
    ["body-timeout-lite","GOOGLE_TIMEOUT",503,2],
    ["timeout-flash","GOOGLE_TIMEOUT",503,1],
    ["network-flash","GOOGLE_NETWORK_ERROR",503,1],
  ]) {
    requests=0;paused=false;calls=[];flashAttempts=0;providerMode=mode;
    const before=logs.length;
    const started=Date.now();
    response=await call({...safe,topic:"goal",facts:goalFacts});
    assert.equal(response.status,status,mode);
    const result=await response.json();
    assert.equal(status===200?result.model:result.code,expected,mode);
    assert.equal(requests,1,mode+": Vault claims");
    assert.equal(flashAttempts,1,mode+": Flash reservations");
    assert.equal(calls.length,count,mode+": actual provider POSTs (including any transport replay)");
    if(count===2) assert.notEqual(calls[0].socket,calls[1].socket,mode+": separate generation connections");
    if(mode==="slow-lite") assert.ok(Date.now()-started>=12000);
    await sleep(100);
    const trace=logs.slice(before).split(/\r?\n/).filter(l=>l.includes("[gemini-generation]")).map(l=>JSON.parse(l.slice(l.indexOf("{"))));
    assert.equal(trace.length,count,mode);
    assert.equal(trace[0].timeoutMs,12000);
    assert.equal(trace[0].attempt,"primary");
    if(count===2){assert.equal(trace[1].timeoutMs,25000);assert.equal(trace[1].attempt,"fallback");assert.equal(trace[0].httpStatus,503);}
    assert.equal(trace.at(-1).outcome,status===200?"success":mode==="network-flash"?"network":"timeout");
    if(mode==="body-timeout-lite") assert.equal(trace.at(-1).httpStatus,200);
    for(const line of trace) assert.deepEqual(Object.keys(line).sort(),["attempt","elapsedMs","httpStatus","model","outcome","timeoutMs"]);
    for(const secret of [userId,"mock-user-jwt","mock-private-role","only-ci-not-real","591.95","17000"]) assert.ok(!logs.slice(before).includes(secret));
  }
  // Nothing in this isolated test calls the real project or Google API.
  console.log("Gemini isolated smoke OK: key/model metadata GET, Flash-only status logs, auth, no-PII, fallback and rate circuit.");
}finally{
  deno.kill("SIGTERM");
  await new Promise(resolve=>stub.close(resolve));
}
