import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {parseFactsheet,plan,berlinDate,previousMonthEnd,mergeDecision} from "./update-vall-factsheet.mjs";
const snapshot=JSON.parse(fs.readFileSync(new URL("./fixtures/vall-october-snapshot.json",import.meta.url)));
const first="Vanguard FTSE Global All-Cap UCITS ETF USD Acc IE000VAHT5T0 FTSE Global All Cap Index Factsheet | 31 October 2026 Total assets (million) $4,353 | Share class assets (million) $4,223 as at 31 October 2026 Ongoing Charges Figure† 0.07%";
const third="Data as at 31 October 2026 unless otherwise stated. Characteristics Fund Benchmark Number of stocks 6,977 10,207 Median market cap $144.5B $149.7B Price/earnings ratio 19.4x 19.3x Price/book ratio 3.2x 3.2x Return on equity 18.5% 18.5% Earnings growth rate 19.0% 19.0% Equity yield (dividend) 1.6% 1.6%";
const pages=[first,"",third];
test("October numbers and duplicate/stale no-op",()=>{
  const p=parseFactsheet(pages);assert.equal(p.record.totalAssetsUsdMillions,4353);assert.equal(p.record.shareClassAssetsUsdMillions,4223);assert.equal(p.record.ongoingChargesPercent,.07);
  for(const k of Object.keys(p.replication)) assert.deepEqual(p.replication[k],snapshot.replicationSnapshot[k]);
  assert.equal(plan(snapshot,p,"2026-11-23").status,"duplicate");
  assert.equal(plan(snapshot,p,"2026-12-15").status,"stale");
});
test("future month append preserves all other fields and warns on new fee",()=>{
  const next=parseFactsheet(pages.map(s=>s.replaceAll("31 October 2026","30 November 2026").replace("0.07%","0.09%")));
  const p=plan(snapshot,next,"2026-12-15");assert.equal(p.status,"new");assert.match(p.body,/\*\*WARNING: OCF changed/);
  assert.deepEqual(p.updated.history.slice(0,-1),snapshot.history);assert.equal(p.updated.history.at(-1).provenance,"direct-pdf-2026-11");
  const {history,checkedOn,replicationSnapshot,...rest}=p.updated;
  const {history:h,checkedOn:c,replicationSnapshot:r,...before}=snapshot;assert.deepEqual(rest,before);
  assert.equal(plan(p.updated,next,"2026-12-18").status,"duplicate");
});
test("bad dates, units, identity and implausible values fail closed",()=>{
  for(const [from,to] of [["IE000VAHT5T0","IE00BK5BQT80"],["(million)","(billion)"],["$4,353","$99"],["$4,223","$5,000"],["0.07%","0.51%"],["31 October","30 October"]]) assert.throws(()=>parseFactsheet([first.replace(from,to),"",third]));
  for(const [from,to] of [["31 October","30 September"],["6,977","11,000"],["19.4x","51x"],["Equity yield (dividend)","Other metric"]]) assert.throws(()=>parseFactsheet([first,"",third.replace(from,to)]));
  assert.throws(()=>plan(snapshot,parseFactsheet(pages),"2026-10-15"));
});
test("Berlin month boundary and leap year",()=>{
  assert.equal(berlinDate(new Date("2026-11-30T23:30:00Z")),"2026-12-01");
  assert.equal(previousMonthEnd("2028-03-15"),"2028-02-29");
});

test("normal growth or equality enables auto-merge; any decrease or fee change requires review",()=>{
  for(const [total,ocf,expected] of [[4500,.07,true],[4353,.07,true],[4300,.07,false],[4500,.08,false],[4500,.06,false],[4300,.08,false]]) {
    const next=parseFactsheet(pages.map(s=>s.replaceAll("31 October 2026","30 November 2026").replace("$4,353","$"+total.toLocaleString("en-US")).replace("0.07%",ocf.toFixed(2)+"%")));
    const result=plan(snapshot,next,"2026-12-15");
    assert.equal(result.autoMerge,expected);
    assert.match(result.body.split("\n")[0],expected?/^Auto-merge: BẬT/:/^Auto-merge: TẮT/);
    if(total<4353){assert.match(result.body,/Total assets USD 4353M → 4300M/);assert.match(result.body,/WARNING: Total assets decreased/);}
    if(ocf!==.07) assert.ok(result.body.includes("OCF 0.07% → "+ocf+"%"));
    assert.deepEqual(result.updated.flags,snapshot.flags);
  }
});
test("generic WARNING or unavailable comparator prevents auto-merge",()=>{
  const row=snapshot.history.at(-1);
  assert.equal(mergeDecision(row,row,"WARNING: additional check").autoMerge,false);
  assert.equal(mergeDecision(row,row,"**warning: additional check**").autoMerge,false);
  assert.equal(mergeDecision({...row,ongoingChargesPercent:null},row,"").autoMerge,false);
  assert.equal(mergeDecision(row,row,"").autoMerge,true);
});
