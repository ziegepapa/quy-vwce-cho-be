import {describe,it,expect} from "vitest";
import {projectEnd,findMonthlyForTarget,findYearsForTarget} from "./engine";
import {buildEtfSleeves,simulationFees,suggestedVallShare} from "./etfAllocation";
import {VWCE_ISIN,VALL_ISIN} from "../types";
const start={balance:550,valuesByIsin:{[VWCE_ISIN]:350,[VALL_ISIN]:200},cash:0,missingIsins:[],staleIsins:[],valuationStatus:"fresh" as const};
const base={years:30,initialBalance:550,monthlyContribution:120,annualReturn:.05,lumpSum:0,annualContributionGrowth:0,ter:.0014};
describe("two ETF simulation",()=>{
  it("keeps old VWCE and VALL separate, routes new money only to VALL",()=>{
    const sleeves=buildEtfSleeves(start,550,false,1);
    expect(sleeves[0].initialBalance).toBe(350);expect(sleeves[1].initialBalance).toBe(200);
    expect(sleeves[0].contributionShare).toBe(0);expect(sleeves[1].contributionShare).toBe(1);
    const out=projectEnd({...base,sleeves});
    const old=projectEnd({...base,initialBalance:350,monthlyContribution:0,ter:simulationFees.vwce});
    const newer=projectEnd({...base,initialBalance:200,ter:simulationFees.vall});
    expect(out.terminal).toBeCloseTo(old.terminal+newer.terminal,2);
    expect(out.contributed).toBe(43200);
    expect(out.yearEnds[0].total).toBe(550);
    expect(out.terminal).toBeGreaterThan(projectEnd({...base,sleeves:buildEtfSleeves(start,550,false,0)}).terminal);
  });
  it("applies allocation to inverse modes, cash stays cash and overrides do not add real holdings",()=>{
    const sleeves=buildEtfSleeves({...start,balance:650,cash:100},650,false,.5);
    const input={...base,initialBalance:650,sleeves};
    const out=projectEnd(input);
    expect(out.sleeveEnds?.find(s=>s.id==="cash")?.terminal).toBe(100);
    expect(findMonthlyForTarget(out.terminal,input)).toBeCloseTo(120,2);
    expect(findYearsForTarget(out.terminal,input)).toEqual({years:30,reached:true});
    const demo=buildEtfSleeves(start,0,true,1);
    expect(demo.every(s=>s.initialBalance===0)).toBe(true);
    expect(projectEnd({...base,initialBalance:0,sleeves:demo}).terminal).toBe(projectEnd({...base,initialBalance:0,ter:simulationFees.vall}).terminal);
  });
});

it("suggests the last recorded eligible ETF buy, never an active broker plan",()=>{
  const t=(id:string,isin:string,date:string)=>({id,date,instrumentIsin:isin,type:"buy_security" as const,amount:120,quantity:1,notes:"",createdAt:date,updatedAt:date});
  const rows=[t("a",VWCE_ISIN,"2026-10-01"),t("b",VALL_ISIN,"2026-11-02"),t("c",VWCE_ISIN,"2026-12-01"),{...t("d",VWCE_ISIN,"2026-11-15"),deletedAt:"2026-11-16"}];
  expect(suggestedVallShare(rows,"2026-11-24")).toBe(1);
  expect(suggestedVallShare([],"2026-11-24")).toBe(.5);
});

it("conserves total contributions for arbitrary cents, split and growth",()=>{
  const input={...base,monthlyContribution:200.01,lumpSum:12.03,annualContributionGrowth:.023};
  const out=projectEnd({...input,sleeves:buildEtfSleeves(start,550,false,.37)});
  const unsplit=projectEnd(input);
  expect(out.contributed).toBe(unsplit.contributed);
  expect(out.yearEnds.map(p=>p.contributed)).toEqual(unsplit.yearEnds.map(p=>p.contributed));
  expect(out.terminal).toBeCloseTo(out.sleeveEnds!.reduce((n,s)=>n+s.terminal,0),2);
});
