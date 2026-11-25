import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { AppLocale } from "../lib/locale";
import { readSharedSnapshot, type SharedSnapshot } from "../lib/mu4SharedReader";
import { replayTransactions, getPosition } from "../lib/calc";
import { buildSimulationStartValue } from "../lib/simulation/portfolioStart";
import { projectEnd } from "../lib/simulation/engine";
import { buildEtfSleeves, suggestedVallShare } from "../lib/simulation/etfAllocation";
import { VWCE_ISIN, VALL_ISIN } from "../lib/types";
import { resolveInstrumentIsin } from "../lib/instrument";
import "../styles/mu4-shared.css";

const copy = {
  vi: { title:"Quỹ gia đình", readOnly:"Chỉ xem", intro:"Dữ liệu đã đồng bộ của chủ quỹ. Không thể sửa hay giao dịch tại đây.", overview:"Tổng quan", history:"Lịch sử", simulation:"Mô phỏng", goals:"Mục tiêu", value:"Giá trị theo giá công khai", cost:"Giá vốn còn lại", units:"Chứng chỉ", quote:"Giá công khai ngày", incomplete:"Thiếu giá hoặc dữ liệu; không hiển thị tổng giá trị đầy đủ.", stale:"Giá có thể đã cũ.", transactions:"Giao dịch", snapshots:"Ảnh chụp theo tháng", empty:"Chưa có dữ liệu đã đồng bộ.", planned:"Mức góp tháng theo kế hoạch", assumption:"Giả định tăng trưởng năm", projection:"Ước tính cuối kỳ", note:"Mô phỏng minh họa theo số dư và mức góp kế hoạch, trước thuế, không đảm bảo. Phân bổ khoản góp dựa vào lần mua gần nhất, không phải lệnh Sparplan.", years:"Số năm", loading:"Đang kiểm tra quyền truy cập…", locked:"Quỹ không khả dụng hoặc quyền đã bị thu hồi. Không hiển thị dữ liệu đã đọc trước đó.", refresh:"Kiểm tra lại", logout:"Đăng xuất", updated:"Đọc từ máy chủ lúc", planMissing:"Chưa có kế hoạch hợp lệ để mô phỏng." },
  de: { title:"Familien-Vault", readOnly:"Nur Lesen", intro:"Synchronisierte Daten des Eigentümers. Änderungen und Buchungen sind hier nicht möglich.", overview:"Übersicht", history:"Verlauf", simulation:"Simulation", goals:"Ziele", value:"Wert zu öffentlichen Kursen", cost:"Verbleibende Anschaffungskosten", units:"Anteile", quote:"Öffentlicher Kurs vom", incomplete:"Kurs oder Daten fehlen; kein vollständiger Gesamtwert verfügbar.", stale:"Kurse können veraltet sein.", transactions:"Transaktionen", snapshots:"Monatliche Übersicht", empty:"Noch keine synchronisierten Daten.", planned:"Geplanter Monatsbeitrag", assumption:"Angenommene Jahresrendite", projection:"Geschätzter Endwert", note:"Illustrative Projektion mit Bestand und Planbeitrag, vor Steuern, ohne Garantie. Beitragsaufteilung nach letztem Kauf, kein Nachweis eines Sparplans.", years:"Jahre", loading:"Zugriff wird geprüft…", locked:"Vault nicht verfügbar oder Zugriff widerrufen. Zuvor gelesene Daten werden nicht angezeigt.", refresh:"Erneut prüfen", logout:"Abmelden", updated:"Vom Server gelesen um", planMissing:"Kein gültiger Plan für die Simulation." },
} as const;
type Tab = "overview" | "history" | "simulation" | "goals";
export default function SharedMemberVault({session,ownerId,locale,onLogout}: {session:Session;ownerId:string;locale:AppLocale;onLogout:()=>Promise<void>}) {
  const t=copy[locale], fmt=new Intl.NumberFormat(locale==="de"?"de-DE":"vi-VN",{style:"currency",currency:"EUR"});
  const number=new Intl.NumberFormat(locale==="de"?"de-DE":"vi-VN",{maximumFractionDigits:6});
  const [data,setData]=useState<SharedSnapshot|null>(null);
  const [state,setState]=useState<"loading"|"locked"|"ready">("loading");
  const [tab,setTab]=useState<Tab>("overview");
  const [years,setYears]=useState(16);
  const [retry,setRetry]=useState(0);
  const generation=useRef(0);
  useEffect(()=>{
    let alive=true;
    let controller:AbortController|undefined;
    let timer:ReturnType<typeof setTimeout>|undefined;
    const hide=()=>{
      ++generation.current;controller?.abort();clearTimeout(timer);
      setData(null);setState("locked");
    };
    const load=async()=>{
      hide();
      if(!navigator.onLine||document.visibilityState==="hidden")return;
      setState("loading");
      const current=++generation.current;
      const requestController=new AbortController();
      controller=requestController;
      const deadline=setTimeout(()=>requestController.abort(),12000);
      try {
        const snapshot=await readSharedSnapshot(session,ownerId,requestController.signal);
        if(!alive||current!==generation.current||requestController.signal.aborted)return;
        setData(snapshot);setState("ready");
      }catch{if(alive&&current===generation.current){setData(null);setState("locked");}}
      finally{clearTimeout(deadline);if(alive&&current===generation.current)timer=setTimeout(()=>void load(),5000);}
    };
    const visible=()=>{if(document.visibilityState==="hidden")hide();else void load();};
    const on=()=>void load();
    window.addEventListener("offline",hide);window.addEventListener("online",on);
    window.addEventListener("pagehide",hide);window.addEventListener("pageshow",on);
    document.addEventListener("visibilitychange",visible);
    void load();
    return()=>{alive=false;++generation.current;controller?.abort();clearTimeout(timer);
      window.removeEventListener("offline",hide);window.removeEventListener("online",on);
      window.removeEventListener("pagehide",hide);window.removeEventListener("pageshow",on);
      document.removeEventListener("visibilitychange",visible);};
  },[session,ownerId,retry]);
  const portfolio=data?replayTransactions(data.transactions):null;
  const start=data?buildSimulationStartValue({transactions:data.transactions,quotes:data.quotes}):null;
  // The owner settings determine whether cash belongs to the portfolio.
  const cash=data?.settings?.trackInAppCash===true?(start?.cash??0):0;
  const balance=start?Object.values(start.valuesByIsin).reduce<number>((sum,v)=>sum+(v??0),cash):0;
  const settings=data?.settings;
  const projection= data&&start&&settings&&start.missingIsins.length===0&&settings.contributionY2>=0&&settings.contributionY2<=1e6&&settings.vwceReturn>-1&&settings.vwceReturn<=1 ?
    projectEnd({years,initialBalance:balance,monthlyContribution:settings.contributionY2,annualReturn:settings.vwceReturn,annualContributionGrowth:0,lumpSum:0,ter:0,sleeves:buildEtfSleeves({...start,balance,cash},balance,false,suggestedVallShare(data.transactions))}):null;
  return <main className="mu4-shell">
    <header className="mu4-head"><div><span className="mu4-readonly">{t.readOnly}</span><h1>{t.title}</h1><p>{t.intro}</p></div><button type="button" onClick={()=>{setData(null);setState("locked");void onLogout();}}>{t.logout}</button></header>
    {state!=="ready"||!data||!portfolio||!start ? <section className="mu4-card" role="status"><p>{state==="loading"?t.loading:t.locked}</p><button type="button" onClick={()=>setRetry(v=>v+1)}>{t.refresh}</button></section> :
    <>
      <nav className="mu4-tabs" aria-label={t.title}>{(["overview","history","simulation","goals"] as const).map(key=><button type="button" key={key} aria-pressed={tab===key} onClick={()=>setTab(key)}>{t[key]}</button>)}</nav>
      {tab==="overview"&&<><section className="mu4-card"><p>{settings?.planName||t.title}</p><h2>{t.value}</h2><strong className="mu4-total">{start.missingIsins.length?"—":fmt.format(balance)}</strong>{start.missingIsins.length>0&&<p role="status">{t.incomplete}</p>}{start.staleIsins.length>0&&<p>{t.stale}</p>}</section>
        <section className="mu4-holdings">{[[VWCE_ISIN,"VWCE"],[VALL_ISIN,"VALL"]].map(([isin,name])=>{const p=getPosition(portfolio,isin),q=data.quotes.find(q=>q.instrumentIsin===isin);return <article className="mu4-card" key={isin}><h2>{name}</h2><small>{isin}</small><strong>{p.qty===0?fmt.format(0):start.valuesByIsin[isin]!=null?fmt.format(start.valuesByIsin[isin]!):"—"}</strong><p>{t.units}: {number.format(p.qty)}</p><p>{t.cost}: {fmt.format(p.costBasis)}</p><small>{t.quote}: {q?.asOf??"—"}</small></article>})}</section></>}
      {tab==="history"&&<><section className="mu4-card"><h2>{t.transactions}</h2>{data.transactions.length===0?<p>{t.empty}</p>:<ul className="mu4-rows">{[...data.transactions].filter(tx=>!tx.deletedAt).sort((a,b)=>b.date.localeCompare(a.date)).map(tx=><li key={tx.id}><span>{tx.date}<small>{resolveInstrumentIsin(tx)===VWCE_ISIN?"VWCE":resolveInstrumentIsin(tx)===VALL_ISIN?"VALL":tx.type}</small></span><strong>{fmt.format(tx.amount)}</strong></li>)}</ul>}</section>
        <section className="mu4-card"><h2>{t.snapshots}</h2>{data.history.length===0?<p>{t.empty}</p>:<ul className="mu4-rows">{[...data.history].sort((a,b)=>b.year-a.year||b.month-a.month).map(row=><li key={row.id}><span>{row.month}/{row.year}</span><strong>{fmt.format(row.totalValue)}</strong></li>)}</ul>}</section></>}
      {tab==="simulation"&&<section className="mu4-card"><h2>{t.simulation}</h2>{projection&&settings?<><label htmlFor="mu4-years">{t.years}: {years}</label><input id="mu4-years" type="range" min={1} max={40} value={years} onChange={e=>setYears(Number(e.target.value))}/><p>{t.planned}: {fmt.format(settings.contributionY2)}</p><p>{t.assumption}: {number.format(settings.vwceReturn*100)}%</p><p>{t.projection}</p><strong className="mu4-total">{fmt.format(projection.terminal)}</strong><p>{t.note}</p></>:<p>{t.planMissing}</p>}</section>}
      {tab==="goals"&&<section className="mu4-card"><h2>{t.goals}</h2>{data.goals.length===0?<p>{t.empty}</p>:<ul className="mu4-rows">{data.goals.map(g=><li key={g.id}><span><span>{g.name}</span><small>{g.dueDate}</small></span><strong>{fmt.format(g.amount)}</strong></li>)}</ul>}</section>}
      <footer className="mu4-footer"><small>{t.updated} {new Date(data.readAt).toLocaleTimeString(locale==="de"?"de-DE":"vi-VN")}</small><button type="button" onClick={()=>setRetry(v=>v+1)}>{t.refresh}</button></footer>
    </>}
  </main>;
}
