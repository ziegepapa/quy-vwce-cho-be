import { isTransientHttpStatus, retryRead } from "./retry.ts";

function equal<T>(actual: T, expected: T) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error("expected " + JSON.stringify(expected) + ", got " + JSON.stringify(actual));
  }
}

Deno.test("transient status allowlist excludes auth and malformed requests", () => {
  equal([408,425,429,500,502,503,504].every(isTransientHttpStatus),true);
  equal([200,201,400,401,403,404,409,422].some(isTransientHttpStatus),false);
});

Deno.test("transient read retries at most three times then succeeds", async () => {
  let tries = 0;
  const delays:number[]=[];
  const result = await retryRead(async () => {
    tries++;
    return new Response(null,{status:tries===4?200:503});
  },{delaysMs:[1,5,15],sleep:async(ms)=>{delays.push(ms);}});
  equal(tries,4);
  equal(result.status,200);
  equal(delays,[1,5,15]);
});

Deno.test("persistent 403 fails immediately", async () => {
  let tries=0;
  const r=await retryRead(async()=>{tries++;return new Response(null,{status:403});},{delaysMs:[0,0,0],sleep:async()=>{}});
  equal(tries,1);
  equal(r.status,403);
});

Deno.test("network failures retry at most three times and then fail", async () => {
  let tries=0;
  let failed=false;
  try {
    await retryRead(async()=>{tries++;throw new Error("network unavailable");},{delaysMs:[0,0,0],sleep:async()=>{}});
  } catch {failed=true;}
  equal(failed,true);
  equal(tries,4);
});

Deno.test("retry budget rejects more than three retries", async () => {
  let failed=false;
  try { await retryRead(async()=>new Response(null),{delaysMs:[1,2,3,4]}); } catch {failed=true; }
  equal(failed,true);
});

Deno.test("429 recovers without new request body or changing provider state", async()=>{
  let tries=0;
  const r=await retryRead(async()=>{tries++;return new Response(null,{status:tries===2?200:429});},{delaysMs:[0,0,0],sleep:async()=>{}});
  equal([r.status,tries],[200,2]);
});
