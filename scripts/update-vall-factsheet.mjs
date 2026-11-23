// Repo-only updater. No app runtime, secrets or financial decisions.
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { parseVallHealth } from "../src/lib/vallHealthSnapshot.ts";
export const URL = "https://fund-docs.vanguard.com/FTSE_Global_All-Cap_UCITS_ETF_USD_Acc_E161_EU_INT_UK_EN.pdf";
const path = fileURLToPath(new globalThis.URL("../src/data/vall-health.json",import.meta.url));
const months = "January February March April May June July August September October November December".split(" ");
const datePattern = "([0-9]{1,2} (?:"+months.join("|")+") [0-9]{4})";
const n = "(?:[0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)(?:\\.[0-9]+)?";
const amount = "("+n+")";
const clean = s => s.replace(/\s+/g," ").trim();
function one(s,re,label) {
  const matches = [...s.matchAll(new RegExp(re,"g"))];
  if(matches.length!==1) throw Error(label+": expected one match, got "+matches.length);
  return matches[0];
}
const num = s=>Number(s.replaceAll(",",""));
function bound(label,v,min,max) {
  if(!Number.isFinite(v)||v<min||v>max) throw Error(label+": "+v+" outside "+min+"–"+max);
  return v;
}
function isoDate(s) {
  const [d,m,y]=s.split(" "); const mm=months.indexOf(m)+1;
  const iso=y+"-"+String(mm).padStart(2,"0")+"-"+d.padStart(2,"0");
  const dt=new Date(iso+"T00:00:00Z");
  if(!mm||!Number.isFinite(+dt)||dt.toISOString().slice(0,10)!==iso||new Date(+dt+86400000).getUTCDate()!==1) throw Error("Not a valid month-end: "+s);
  return iso;
}
export function berlinDate(now=new Date()) {
  const p=Object.fromEntries(new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Berlin",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(now).map(x=>[x.type,x.value]));
  return p.year+"-"+p.month+"-"+p.day;
}
export function previousMonthEnd(today) {
  return new Date(today.slice(0,7)+"-01T00:00:00Z").toISOString().slice(0,10) === today.slice(0,7)+"-01" ? new Date(Date.parse(today.slice(0,7)+"-01T00:00:00Z")-86400000).toISOString().slice(0,10) : (()=>{throw Error("invalid run date")})();
}
export function parseFactsheet(pages) {
  if(pages.length<3) throw Error("PDF page count");
  const first=clean(pages[0]), third=clean(pages[2]);
  if(!first.includes("IE000VAHT5T0")||!first.includes("Vanguard FTSE Global All-Cap UCITS ETF")||!first.includes("USD Acc")||!first.includes("FTSE Global All Cap Index")) throw Error("wrong fund / share class / benchmark");
  const date=isoDate(one(first,"Factsheet\\s*\\|\\s*"+datePattern,"factsheet date")[1]);
  const assets=one(first,"Total assets \\(million\\)\\s*\\$\\s*"+amount+"\\s*\\|\\s*Share class assets \\(million\\)\\s*\\$\\s*"+amount+"\\s+as at "+datePattern,"USD million assets");
  if(isoDate(assets[3])!==date||isoDate(one(third,"Data as at "+datePattern+" unless otherwise stated","characteristics date")[1])!==date) throw Error("Mixed factsheet dates");
  const total=bound("Total assets",num(assets[1]),100,100000);
  const share=bound("Share class assets",num(assets[2]),1,total);
  const ocf=bound("OCF",num(one(first,"Ongoing Charges Figure\\s*[†‡*]?\\s*"+amount+"\\s*%","OCF")[1]),0,0.5);
  // Restrict matching to the characteristics table, excluding its glossary.
  const table=one(third,"Characteristics\\s+Fund\\s+Benchmark\\s+([\\s\\S]+?)Equity yield \\(dividend\\)\\s+"+amount+"\\s*%\\s+"+amount+"\\s*%","characteristics table");
  const block=table[0];
  function pair(label,unit,min,max) {
    const m=one(block,label+"\\s+"+amount+unit+"\\s+"+amount+unit,label);
    return {fund:bound(label+" fund",num(m[1]),min,max),benchmark:bound(label+" benchmark",num(m[2]),min,max)};
  }
  const holdings=pair("Number of stocks","",1,500000);
  if(!Number.isInteger(holdings.fund)||!Number.isInteger(holdings.benchmark)||holdings.fund>=holdings.benchmark) throw Error("Number of stocks: expected integer fund < benchmark");
  const provenance="direct-pdf-"+date.slice(0,7);
  return {record:{asOf:date,totalAssetsUsdMillions:total,shareClassAssetsUsdMillions:share,ongoingChargesPercent:ocf,trackingDifferenceAnnualPp:null,sourceUrl:URL,provenance},
    replication:{asOf:date,sourceUrl:URL,provenance,holdings,priceEarnings:pair("Price/earnings ratio","\\s*x",5,50),priceBook:pair("Price/book ratio","\\s*x",0,100),returnOnEquityPercent:pair("Return on equity","\\s*%",0,100),earningsGrowthPercent:pair("Earnings growth rate","\\s*%",0,100),dividendYieldPercent:pair("Equity yield \\(dividend\\)","\\s*%",0,100)}};
}
export function plan(snapshot, parsed, today) {
  if(!parseVallHealth(snapshot)) throw Error("Existing VALL data invalid");
  const {record,replication}=parsed, expected=previousMonthEnd(today);
  if(record.asOf<expected) return {status:"stale",expected};
  if(record.asOf!==expected) throw Error("Unexpected future/current factsheet "+record.asOf+"; expected "+expected);
  const last=snapshot.history.at(-1);
  if(snapshot.history.some(x=>x.asOf===record.asOf)) return {status:"duplicate",expected};
  if(record.asOf<=last.asOf) throw Error("History would be out of order");
  if(last.asOf!==previousMonthEnd(record.asOf)) throw Error("Missing prior month; manual reconciliation required");
  if(today<snapshot.checkedOn) throw Error("Run date older than checkedOn");
  const updated={...snapshot,checkedOn:today,history:[...snapshot.history,record],replicationSnapshot:replication};
  if(!parseVallHealth(updated)) throw Error("Generated VALL data invalid");
  const change=(record.totalAssetsUsdMillions/last.totalAssetsUsdMillions-1)*100;
  const feeChanged=record.ongoingChargesPercent!==last.ongoingChargesPercent;
  const lines=["Factsheet "+record.asOf,"","Total assets: USD "+record.totalAssetsUsdMillions+"M ("+(change>=0?"+":"")+change.toFixed(2)+"% vs "+last.asOf+"; fund size, NOT return).","Share class: USD "+record.shareClassAssetsUsdMillions+"M.",feeChanged?"**WARNING: OCF changed: "+last.ongoingChargesPercent+"% → "+record.ongoingChargesPercent+"%. Review manually.**":"OCF unchanged: "+record.ongoingChargesPercent+"%.","","Characteristics (fund / index; previous → new):"];
  for(const k of ["holdings","priceEarnings","priceBook","returnOnEquityPercent","earningsGrowthPercent","dividendYieldPercent"]) {
    const old=snapshot.replicationSnapshot[k], next=replication[k];
    lines.push("- "+k+": "+old.fund+" / "+old.benchmark+" → "+next.fund+" / "+next.benchmark);
  }
  lines.push("","PDF: "+URL,"","Draft only. Manual verification and approval required. TD, flags, Sparplan and review dates untouched.");
  return {status:"new",updated,body:lines.join("\n")};
}
export async function fetchPages() {
  const res=await fetch(URL,{redirect:"error",signal:AbortSignal.timeout(30000),cache:"no-store",headers:{"Cache-Control":"no-cache"}});
  if(!res.ok) throw Error("PDF HTTP "+res.status);
  const bytes=new Uint8Array(await res.arrayBuffer());
  if(bytes.length>10*1024*1024||String.fromCharCode(...bytes.slice(0,5))!=="%PDF-") throw Error("Invalid PDF response");
  const {getDocument}=await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf=await getDocument({data:bytes,isEvalSupported:false,disableFontFace:true,useSystemFonts:false}).promise;
  try {
    if(pdf.numPages<3||pdf.numPages>10) throw Error("Unexpected PDF page count");
    const pages=[];
    for(let i=1;i<=3;i++) {
      const page=await pdf.getPage(i);
      const t=await page.getTextContent();
      pages.push(t.items.filter(x=>"str" in x).map(x=>x.str).join(" "));
    }
    return pages;
  } finally {await pdf.destroy();}
}
async function main() {
  const dry=process.argv.includes("--dry-run");
  const parsed=parseFactsheet(await fetchPages());
  const snapshot=JSON.parse(fs.readFileSync(path,"utf8"));
  const result=plan(snapshot,parsed,berlinDate());
  console.log(JSON.stringify({status:result.status,asOf:parsed.record.asOf,totalAssetsUsdMillions:parsed.record.totalAssetsUsdMillions,shareClassAssetsUsdMillions:parsed.record.shareClassAssetsUsdMillions,ocf:parsed.record.ongoingChargesPercent,replication:parsed.replication}));
  if(result.status==="duplicate"){
    const row=snapshot.history.find(x=>x.asOf===parsed.record.asOf);
    for(const k of ["totalAssetsUsdMillions","shareClassAssetsUsdMillions","ongoingChargesPercent"]) if(row[k]!==parsed.record[k]) throw Error("Existing period differs: "+k);
    if(snapshot.replicationSnapshot.asOf===row.asOf) for(const k of ["holdings","priceEarnings","priceBook","returnOnEquityPercent","earningsGrowthPercent","dividendYieldPercent"]) if(JSON.stringify(snapshot.replicationSnapshot[k])!==JSON.stringify(parsed.replication[k])) throw Error("Existing replication differs: "+k);
  }
  if(result.status!=="new"||dry) return;
  fs.writeFileSync(path,JSON.stringify(result.updated,null,2)+"\n");
  if(process.env.VALL_PR_BODY) fs.writeFileSync(process.env.VALL_PR_BODY,result.body+"\n",{flag:"wx"});
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]) main().catch(e=>{console.error("FAIL:",e.message);process.exitCode=1;});
