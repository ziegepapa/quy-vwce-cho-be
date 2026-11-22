// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import GeminiVaultExplainer from "./GeminiVaultExplainer";
import type { GeminiFacts } from "../lib/geminiVaultFacts";
import type { Goal } from "../lib/types";
const facts: GeminiFacts = {
  portfolioValue:591.95,contributed:600,monthly:120,
  yearRecorded:600,yearPlanned:480,year:2026,
  goalAmount:null,goalYear:null,goalMode:null,
  simulationYear:2046,cautious:12000,base:25000,optimistic:31000,
};
const goal:Goal={ id:"test-goal",name:"Training",dueDate:"2038-06-30",
  amount:10000,mode:"nominal",baseYear:2026,inflationRate:0.02,bufferPct:0,
  urgency:"hard",protectedAmount:0,notes:"",createdAt:"2026-01-01",updatedAt:"2026-01-01" };
afterEach(cleanup);
describe("Gemini AI screen — safe without any API key",()=>{
  it("always shows deterministic contributions without any network or Supabase setup",()=>{
    render(<GeminiVaultExplainer locale="de" goals={[goal]} facts={facts}/>);
    expect(screen.getByText(/600,00/)).toBeTruthy();
    expect(screen.getByText(/591,95/)).toBeTruthy();
    expect(screen.getByText("KI noch nicht bereit: Funktion, Schlüssel oder Serverfreigabe fehlen.")).toBeTruthy();
    expect(screen.getByRole("button",{name:"KI fragen"}).hasAttribute("disabled")).toBe(true);
    expect(document.body.textContent).toContain("Google-Produkte zu verbessern");
  });
  it("answers year and simulation using existing fact snapshot without a provider call",()=>{
    render(<GeminiVaultExplainer locale="de" goals={[goal]} facts={facts}/>);
    fireEvent.click(screen.getByRole("button",{name:"Dieses Jahr"}));
    expect(screen.getByText(/600,00/)).toBeTruthy();
    expect(document.body.textContent).toContain("keine Bestätigung durch den Broker");
    fireEvent.click(screen.getByRole("button",{name:"Simulation"}));
    expect(document.body.textContent).toContain("Rechenbeispiele");
    expect(document.body.textContent).toContain("keine Zusage");
  });
  it("does not auto-select a sale year; the owner must select a Goal",()=>{
    render(<GeminiVaultExplainer locale="vi" goals={[goal]} facts={facts}/>);
    fireEvent.click(screen.getByRole("button",{name:"Mục tiêu"}));
    expect(document.body.textContent).toContain("Chưa chọn Goal");
    expect(screen.getByRole("combobox").getAttribute("value")).toBeNull();
    fireEvent.change(screen.getByLabelText("Bạn muốn hỏi về Goal nào?"),
      {target:{value:"test-goal"}});
    expect(document.body.textContent).toContain("2038");
    expect(document.body.textContent).toContain("10.000");
    expect(screen.getByText(/Google có thể dùng nội dung gửi qua bản miễn phí/)).toBeTruthy();
  });
  it("does not enable a provider request simply because user checked consent",()=>{
    render(<GeminiVaultExplainer locale="de" goals={[]} facts={facts}/>);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("button",{name:"KI fragen"}).hasAttribute("disabled")).toBe(true);
  });
});
