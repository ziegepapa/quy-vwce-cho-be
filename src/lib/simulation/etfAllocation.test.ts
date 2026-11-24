import {describe,it,expect} from "vitest";
import {projectEnd,findMonthlyForTarget,findYearsForTarget} from "./engine";
import {buildEtfSleeves,simulationFees} from "./etfAllocation";
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
