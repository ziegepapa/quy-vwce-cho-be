import { round2 } from "../calc";
import { isSecurityBuy, resolveInstrumentIsin } from "../instrument";
import { VALL_ISIN, VWCE_ISIN, type Transaction } from "../types";
import snapshot from "../../data/vall-health.json";
import { parseVallHealth } from "../vallHealthSnapshot";
import { DEFAULT_TER, type ProjectionSleeve } from "./engine";
import type { SimulationStartValue } from "./portfolioStart";

const validated = parseVallHealth(snapshot);
const current = validated?.history.at(-1);
export const simulationFees = {
  vwce: DEFAULT_TER,
  vall: current?.ongoingChargesPercent != null ? current.ongoingChargesPercent/100 : .0007,
  vallAsOf: current?.asOf ?? "",
  fallback: current?.ongoingChargesPercent == null,
};

/** A recorded purchase is not proof of an active broker savings plan. */
export function suggestedVallShare(txs: readonly Transaction[]): number {
  const today = new Date().toISOString().slice(0,10);
  const latest = [...txs].filter(t=>!t.deletedAt && t.date<=today && isSecurityBuy(t.type)
    && Number.isFinite(t.amount) && t.amount>0 && (resolveInstrumentIsin(t)===VALL_ISIN || resolveInstrumentIsin(t)===VWCE_ISIN))
    .sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id))[0];
  return latest ? (resolveInstrumentIsin(latest)===VALL_ISIN?1:0) : .5;
}

export function buildEtfSleeves(start:SimulationStartValue, initial:number, override:boolean, vallShare:number, fees=simulationFees):ProjectionSleeve[] {
  const v = Math.max(0,Math.min(1,Number.isFinite(vallShare)?vallShare:.5));
  const vwce = override ? round2(initial*(1-v)) : round2(start.valuesByIsin[VWCE_ISIN] ?? 0);
  const vall = override ? round2(initial-vwce) : round2(start.valuesByIsin[VALL_ISIN] ?? 0);
  const cash = override ? 0 : round2(start.cash);
  const other = override ? 0 : Math.max(0,round2(Object.entries(start.valuesByIsin).filter(([id])=>id!==VWCE_ISIN&&id!==VALL_ISIN).reduce((sum,[,value])=>sum+(value??0),0)));
  // Allocate the rounding residual to a valued sleeve to keep the exact start total.
  const sleeves:ProjectionSleeve[]=[{id:"VWCE",initialBalance:vwce,contributionShare:1-v,ter:fees.vwce},
    {id:"VALL",initialBalance:vall,contributionShare:v,ter:fees.vall},
    {id:"cash",initialBalance:cash,contributionShare:0,ter:0,cash:true},
    {id:"other",initialBalance:other,contributionShare:0,ter:DEFAULT_TER}];
  const largest=sleeves.reduce((a,b)=>a.initialBalance>=b.initialBalance?a:b);
  largest.initialBalance=round2(largest.initialBalance+round2(initial-sleeves.reduce((sum,s)=>sum+s.initialBalance,0)));
  return sleeves;
}
