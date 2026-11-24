import {it,expect} from "vitest";
import {configuredMonthlyAt} from "./configuredMonthly";
it("respects first 12 months, zero pause and unknown/future dates",()=>{
  const s={startDate:"2026-08-01",contributionY1:75,contributionY2:0};
  expect(configuredMonthlyAt(s,new Date(2026,10,24))).toBe(75);
  expect(configuredMonthlyAt(s,new Date(2027,7,1))).toBe(0);
  expect(configuredMonthlyAt(s,new Date(2026,6,1))).toBeNull();
  expect(configuredMonthlyAt({...s,startDate:"2026-02-30"},new Date(2026,10,24))).toBeNull();
});
