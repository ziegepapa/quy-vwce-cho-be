import { expect,test,type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
const base="http://127.0.0.1:4173/quy-vwce-cho-be/";
test("MU4 actual app two synthetic accounts, isolated reader and revocation",async({browser},info)=>{
  const url=process.env.SUPABASE_URL,anon=process.env.SUPABASE_ANON_KEY,service=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(url!=="http://127.0.0.1:54321"||!anon||!service||process.env.CI!=="true")throw new Error("MU4 refuses non-local test");
  const opts={auth:{persistSession:false,autoRefreshToken:false}};
  const privileged=createClient(url,service,opts);
  const stamp=randomUUID(),password=randomUUID()+"Aa!9";
  async function identity(label:string){
    const email="mu4-"+label+"-"+stamp+"@example.invalid";
    const created=await privileged.auth.admin.createUser({email,password,email_confirm:true});
    expect(created.error).toBeNull();
    const client=createClient(url!,anon!,opts);
    const login=await client.auth.signInWithPassword({email,password});
    expect(login.error).toBeNull();
    return {id:login.data.user!.id,email,client,token:login.data.session!.access_token};
  }
  const owner=await identity("owner"),member=await identity("member");
  const now=new Date().toISOString(),date=now.slice(0,10);
  const seed=async(table:string,id:string,data:object)=>{
    const result=await owner.client.from(table).insert({id,user_id:owner.id,version:1,data:{id,...data}});
    expect(result.error).toBeNull();
  };
  await seed("app_settings","settings",{planName:"Synthetischer Familienplan",childName:"Test",accountType:"parent",currency:"EUR",contributionY1:120,contributionY2:120,vwceReturn:.05,safeReturn:.015,inflationRate:.02,bufferPct:.1,endMode:"flexible",startDate:"2026-08-01",endDate:"2042-08-01",latestVwcePrice:0,latestPriceDate:"",trackInAppCash:false,onboardingDone:true,disclaimerAccepted:true,createdAt:now,updatedAt:now});
  const tx=(id:string,isin:string,quantity:number,unitPrice:number)=>({id,date,type:"buy_security",amount:quantity*unitPrice,instrumentIsin:isin,quantity,unitPrice,fee:0,tax:0,notes:"",createdAt:now,updatedAt:now,source:"manual"});
  await seed("transactions","mu4-vwce",tx("mu4-vwce","IE00BK5BQT80",2,100));
  await seed("transactions","mu4-vall",tx("mu4-vall","IE000VAHT5T0",10,5));
  await seed("goals","mu4-goal",{name:"Testziel",dueDate:"2042-08-01",amount:1000,mode:"nominal",baseYear:2026,inflationRate:0,bufferPct:0,urgency:"hard",protectedAmount:0,notes:"",createdAt:now,updatedAt:now});
  await seed("monthly_snapshots","mu4-month",{year:2026,month:11,totalValue:250,vwceValue:250,cashValue:0,contributed:250,withdrawn:0,createdAt:now,updatedAt:now});
  await seed("annual_checklists","mu4-check",{year:2026,items:[],createdAt:now,updatedAt:now});
  const membership={owner_user_id:owner.id,member_user_id:member.id};
  expect((await privileged.from("vault_memberships").insert({...membership,role:"member",status:"active",activated_at:now})).error).toBeNull();
  const ctx=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:"block"});
  await ctx.addInitScript(()=>localStorage.setItem("vwce-locale","de"));
  await ctx.route("**/data/quotes.json",r=>r.fulfill({json:{schemaVersion:2,generatedAt:now,quotes:[{instrumentIsin:"IE00BK5BQT80",currency:"EUR",price:100,asOf:date},{instrumentIsin:"IE000VAHT5T0",currency:"EUR",price:5,asOf:date}]}}));
  const page=await ctx.newPage();
  const writes:string[]=[];
  page.on("request",r=>{if(r.url().includes("/rest/v1/")&&r.method()!=="GET"&&r.method()!=="HEAD"&&r.method()!=="OPTIONS")writes.push(r.method());});
  async function signIn(p:Page,email:string){
    await p.goto(base);
    // The dev-only exception must be present before a real browser Auth request.
    const policy=await p.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content");
    const connect=policy?.split(";").find(d=>d.trim().startsWith("connect-src "))?.trim();
    expect(connect).toBe("connect-src 'self' https://*.supabase.co wss://*.supabase.co http://127.0.0.1:54321");
    await p.locator("#email").fill(email);
    await p.locator("#password").fill(password);
    await p.locator("form").getByRole("button",{name:"Anmelden",exact:true}).click();
  }
  const failures:string[]=[];
  page.on("pageerror",e=>failures.push(e.name+": "+e.message.slice(0,200)));
  page.on("response",r=>{const u=new URL(r.url());if(u.pathname.startsWith("/auth/v1/")||u.pathname.startsWith("/rest/v1/")) failures.push(r.request().method()+" "+u.pathname+" "+r.status());});
  page.on("requestfailed",r=>{const u=new URL(r.url());if(u.origin===url && (u.pathname.startsWith("/auth/v1/")||u.pathname.startsWith("/rest/v1/"))) failures.push("requestfailed "+r.method()+" "+u.pathname+" "+(r.failure()?.errorText??"unknown"));});
  page.on("console",m=>{if(/Content Security Policy/i.test(m.text())&&m.text().includes("127.0.0.1:54321"))failures.push("local Auth/REST blocked by CSP");});
  try {
    const loginResponse=page.waitForResponse(r=>{const u=new URL(r.url());return u.origin===url && u.pathname==="/auth/v1/token" && r.request().method()==="POST";},{timeout:5000});
    await signIn(page,member.email);
    expect((await loginResponse).status()).toBe(200);
    await expect(page.getByText("Nur Lesen",{exact:true})).toBeVisible();
    console.log("PASS real browser password Auth HTTP 200 and German member view");
  } catch(e) {
    console.log("MU4 login diagnostics",JSON.stringify(failures),await page.locator("body").innerText());
    throw e;
  }
  await expect(page.getByText("Synthetischer Familienplan",{exact:true})).toBeVisible();
  await expect(page.locator(".mu4-total")).toContainText("250,00");
  await expect(page.getByRole("heading",{name:"VWCE",exact:true})).toBeVisible();
  await expect(page.getByRole("heading",{name:"VALL",exact:true})).toBeVisible();
  await page.screenshot({path:info.outputPath("mu4-member-overview.png")});
  await page.getByRole("button",{name:"Verlauf",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Transaktionen",exact:true})).toBeVisible();
  await expect(page.locator(".mu4-rows").first().locator("li")).toHaveCount(2);
  await page.screenshot({path:info.outputPath("mu4-member-history.png")});
  await page.getByRole("button",{name:"Simulation",exact:true}).click();
  await expect(page.getByText("Geschätzter Endwert",{exact:true})).toBeVisible();
  await expect(page.locator(".mu4-total")).not.toHaveText("—");
  await page.screenshot({path:info.outputPath("mu4-member-simulation.png")});
  await page.getByRole("button",{name:"Ziele",exact:true}).click();
  await expect(page.getByText("Testziel",{exact:true})).toBeVisible();
  for(const hash of ["#/settings","#/transactions","#/notfallmappe","#/goals"]){
    await page.goto(base+hash);
    await expect(page.getByText("Nur Lesen",{exact:true})).toBeVisible();
    await expect(page.locator(".mu4-tabs")).toBeVisible();
    await expect(page.locator(".set-wrap,.tx-ledger-workspace,.bottom-dock,.mu3-panel")).toHaveCount(0);
    await expect(page.getByRole("button",{name:/Einladung|löschen|hinzufügen|bearbeiten|wiederherstellen|exportieren/i})).toHaveCount(0);
  }
  // Member never opens the legacy writable owner database, even on deep links.
  expect(await page.evaluate(async()=> (await indexedDB.databases()).some(db=>db.name==="quy_vwce_cho_be"||db.name==="quy_vwce_mu4_local_owner"))).toBe(false);
  expect(writes).toEqual([]);
  console.log("PASS real member app overview, ETFs, history, simulation, goals, deep links; no writable store or REST mutations");
  const tables=["app_settings","goals","transactions","annual_checklists","monthly_snapshots"];
  const ids=["settings","mu4-goal","mu4-vwce","mu4-check","mu4-month"];
  for(let i=0;i<tables.length;i++){
    const table=tables[i],id=ids[i];
    const before=await owner.client.from(table).select("*").eq("user_id",owner.id).eq("id",id).single();
    expect(before.error).toBeNull();
    expect((await member.client.from(table).select("id").eq("user_id",owner.id).eq("id",id)).data).toHaveLength(1);
    expect((await member.client.from(table).insert({id:"forged",user_id:owner.id,version:1,data:{id:"forged"}})).error?.code).toBe("42501");
    const patch=await member.client.from(table).update({data:{id,forged:true}}).eq("user_id",owner.id).eq("id",id).select();
    expect(patch.error?.code==="42501"||patch.data?.length===0).toBe(true);
    const del=await member.client.from(table).delete().eq("user_id",owner.id).eq("id",id).select();
    expect(del.error?.code==="42501"||del.data?.length===0).toBe(true);
    const after=await owner.client.from(table).select("*").eq("user_id",owner.id).eq("id",id).single();
    expect(after.data).toEqual(before.data);
  }
  const promote=await member.client.from("vault_memberships").update({role:"admin"}).match(membership).select();
  expect(promote.error?.code==="42501"||promote.data?.length===0).toBe(true);
  console.log("PASS five entity tables deny member INSERT/UPDATE/DELETE and self-promotion; exact owner rows unchanged");
  await seed("transactions","mu4-owner-new",tx("mu4-owner-new","IE000VAHT5T0",2,5));
  await page.getByRole("button",{name:"Erneut prüfen",exact:true}).click();
  await expect(page.locator(".mu4-total")).toContainText("260,00");
  console.log("PASS owner write reflected by next member refresh");
  const rev=await owner.client.from("vault_memberships").update({status:"revoked"}).match(membership).select();
  expect(rev.error).toBeNull();expect(rev.data?.[0]?.status).toBe("revoked");
  expect((await member.client.auth.getUser(member.token)).error).toBeNull();
  expect((await member.client.from("transactions").select("id").eq("user_id",owner.id)).data).toHaveLength(0);
  await expect(page.getByText(/Vault nicht verfügbar oder Zugriff widerrufen/)).toBeVisible({timeout:15000});
  await expect(page.locator(".mu4-total,.mu4-holdings,.mu4-tabs")).toHaveCount(0);
  await page.screenshot({path:info.outputPath("mu4-member-revoked.png")});
  await page.reload();
  await expect(page.getByText(/Kein freigegebener Zugriff/)).toBeVisible();
  await expect(page.locator(".mu4-total,.set-wrap,.bottom-dock")).toHaveCount(0);
  expect(writes).toEqual([]);
  console.log("PASS old member JWT valid but owner rows denied; visible member snapshot cleared, reload locked");
  await page.getByRole("button",{name:"Abmelden",exact:true}).click();
  await expect(page.locator("#email")).toBeVisible();
  await signIn(page,owner.email);
  await expect(page.locator(".app-layout,.onboarding")).toBeVisible({timeout:20000});
  await expect(page.getByText("Nur Lesen",{exact:true})).toHaveCount(0);
  expect((await owner.client.from("transactions").select("id").eq("user_id",owner.id)).data).toHaveLength(3);
  console.log("PASS owner normal app mounts after member logout; owner three transactions preserved");
  await ctx.close();
});
