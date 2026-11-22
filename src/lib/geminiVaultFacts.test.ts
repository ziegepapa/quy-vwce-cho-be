import { describe, expect, it } from "vitest";
import { defaultSettings } from "./defaults";
import { buildGeminiVaultFacts, classifyGeminiQuestion, withSelectedGoal } from "./geminiVaultFacts";
import type { Goal, Transaction } from "./types";

const times = ["2026-08-02","2026-09-02","2026-10-02","2026-11-02","2026-11-16"];
const ledger: Transaction[] = times.map((date,index)=>({
  id: "mock-"+index, date, type:index<3?"buy_vwce":"buy_security",
  amount:120, quantity:1, unitPrice:120, notes:"",
  createdAt:date+"T10:00:00Z", updatedAt:date+"T10:00:00Z",
}));
const goal: Goal = {
  id:"mock-goal-4", name:"PRIVATE CHILD NAME — MUST NOT LEAK", dueDate:"2047-06-30",
  amount:32000, mode:"nominal", baseYear:2026, inflationRate:0.02,bufferPct:0.1,
  urgency:"flexible",protectedAmount:0,notes:"PRIVATE NOTES",createdAt:"2026-01-01",updatedAt:"2026-01-01",
};
const build = () => {
  const settings=defaultSettings();
  settings.contributionY1=120;settings.contributionY2=120;settings.startDate="2026-08-01";
  return buildGeminiVaultFacts({settings,transactions:ledger,currentValue:591.95,
    today:new Date(2026,10,22),simulationEndYear:2047,
    scenarioTotals:{cautious:23000,base:31000,optimistic:42000}});
};
describe("Gemini redacted aggregate data",()=>{
  it("uses heroLifetime + planVsReality (not cash_in zero) for synthetic five-buy fixtures",()=>{
    const facts=build();
    expect(facts.portfolioValue).toBe(591.95);
    expect(facts.contributed).toBe(600);
    expect(facts.monthly).toBe(120);
    expect(facts.yearRecorded).toBe(600);
    expect(facts.yearPlanned).toBe(480);
    expect(facts.goalYear).toBeNull();
    expect(facts.base).toBe(31000);
  });
  it("does not pass goal names, IDs, notes or raw transactions to provider",()=>{
    const full=withSelectedGoal(build(),goal);
    expect(full.goalAmount).toBe(32000);
    expect(full.goalYear).toBe(2047);
    const raw=JSON.stringify(full);
    expect(raw).not.toContain("PRIVATE");
    expect(raw).not.toContain(goal.id);
    expect(raw).not.toContain(goal.name);
    expect(raw).not.toContain("mock-");
  });
  it("never chooses a fallback date, goal or price",()=>{
    const base=build();
    expect(withSelectedGoal(base,null).goalYear).toBeNull();
    expect(withSelectedGoal(base,{...goal,deletedAt:"2026-11-11"}).goalYear).toBeNull();
    const noSettings=buildGeminiVaultFacts({settings:null,transactions:[],
      currentValue:null,today:new Date(2026,10,22)});
    expect(noSettings.monthly).toBeNull();
    expect(noSettings.portfolioValue).toBeNull();
    expect(noSettings.yearPlanned).toBeNull();
    expect(noSettings.contributed).toBeNull();
  });
  it("prevents double counting cash-in together with purchases",()=>{
    const withCash=ledger.concat({ ...ledger[0], id:"cash",type:"cash_in",amount:120});
    const settings=defaultSettings();settings.trackInAppCash=false;settings.startDate="2026-08-01";
    expect(buildGeminiVaultFacts({settings,transactions:withCash,currentValue:null,
      today:new Date(2026,10,22)}).contributed).toBe(600);
    settings.trackInAppCash=true;
    expect(buildGeminiVaultFacts({settings,transactions:withCash,currentValue:null,
      today:new Date(2026,10,22)}).contributed).toBe(120);
  });
  it("classifies text locally, never sending it as the question",()=>{
    expect(classifyGeminiQuestion("Habe ich dieses Jahr genug eingezahlt?")).toEqual({topic:"year",queryYear:null});
    expect(classifyGeminiQuestion("Was ist im Jahr 2042?")).toEqual({topic:"goal",queryYear:2042});
    expect(classifyGeminiQuestion("Giải thích mô phỏng")).toEqual({topic:"simulation",queryYear:null});
    expect(classifyGeminiQuestion("Konto DE02100100109307118603")).toBeNull();
    expect(classifyGeminiQuestion("Mein Passwort lautet geheim")).toBeNull();
    expect(classifyGeminiQuestion("Hallo, wie heißt mein Kind?")).toBeNull();
    const cases = [
      ["Tổng đã góp bao nhiêu?", "plan"],
      ["Giá trị quỹ hiện tại là bao nhiêu?", "value"],
      ["Wie hoch ist mein Depotwert?", "value"],
      ["Quỹ của tôi đang lãi hay lỗ?", "difference"],
      ["Was ist die Differenz zum eingezahlten Betrag?", "difference"],
      ["Mỗi tháng tôi góp bao nhiêu?", "monthly"],
      ["Wie hoch ist meine Sparrate monatlich?", "monthly"],
      ["Tiến độ mục tiêu thế nào?", "goalProgress"],
      ["Wie weit bin ich bis zum Ziel?", "goalProgress"],
    ] as const;
    for (const [question, topic] of cases) {
      expect(classifyGeminiQuestion(question)).toEqual({ topic, queryYear:null });
    }
    expect(classifyGeminiQuestion("Mục tiêu 2038 và 2040")).toBeNull();
    expect(classifyGeminiQuestion("Tôi có nên bán ETF không?")).toBeNull();
    expect(classifyGeminiQuestion("alice@example.org hỏi về kế hoạch")).toBeNull();
  });
});
