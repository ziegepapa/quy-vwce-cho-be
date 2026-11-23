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
    expect(document.body.textContent).toContain("600,00");
    expect(document.body.textContent).toContain("591,95");
    expect(screen.getByText("KI nicht bereit: Schlüssel oder Freigabe prüfen.")).toBeTruthy();
    expect(screen.getByRole("button",{name:"KI fragen"}).hasAttribute("disabled")).toBe(true);
    expect(document.body.textContent).toContain("Free-Tier-Inhalte zur Produktverbesserung nutzen");
  });
  it("answers year and simulation using existing fact snapshot without a provider call",()=>{
    render(<GeminiVaultExplainer locale="de" goals={[goal]} facts={facts}/>);
    fireEvent.click(screen.getByRole("button",{name:"Dieses Jahr"}));
    expect(document.body.textContent).toContain("600,00");
    expect(document.body.textContent).toContain("Kein Brokerbeleg");
    fireEvent.click(screen.getByRole("button",{name:"Simulation"}));
    expect(document.body.textContent).toContain("Szenarien");
    expect(document.body.textContent).toContain("Keine Prognose");
  });
  it("does not auto-select a sale year; the owner must select a Goal",()=>{
    render(<GeminiVaultExplainer locale="vi" goals={[goal]} facts={facts}/>);
    fireEvent.click(screen.getByRole("button",{name:"Mục tiêu"}));
    expect(document.body.textContent).toContain("Chưa chọn Goal");
    expect(screen.getByRole("combobox").getAttribute("value")).toBeNull();
    fireEvent.change(screen.getByLabelText("Chọn Goal cần giải thích"),
      {target:{value:"test-goal"}});
    expect(document.body.textContent).toContain("2038");
    expect(document.body.textContent).toContain("10.000");
    expect(screen.getByText(/Google có thể dùng dữ liệu Free Tier/)).toBeTruthy();
  });
  it("uses correct 560 < 600 year comparison without exposing Gemini request",()=>{
    render(<GeminiVaultExplainer locale="vi" goals={[goal]}
      facts={{...facts,contributed:560,yearRecorded:560,yearPlanned:600}}/>);
    fireEvent.click(screen.getByRole("button",{name:"Năm nay"}));
    expect(document.body.textContent?.replaceAll("\u00a0"," ")).toContain("Năm nay ghi 560,00 €, dự kiến 600,00 €");
    expect(document.body.textContent).toContain("Số góp ghi trong sổ còn thấp hơn kế hoạch");
    expect(document.body.textContent).toContain("không gửi Google, không trừ lượt AI");
    expect(screen.queryByRole("button",{name:"Hỏi Gemini"})).toBeNull();
    expect(screen.queryByRole("button",{name:"Kiểm tra kết nối AI"})).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    fireEvent.click(screen.getByRole("button",{name:"Chênh lệch"}));
    expect(screen.queryByRole("button",{name:"Hỏi Gemini"})).toBeNull();
    fireEvent.click(screen.getByRole("button",{name:"Tiến độ Goal"}));
    expect(screen.queryByRole("button",{name:"Hỏi Gemini"})).toBeNull();
    fireEvent.click(screen.getByRole("button",{name:"Kế hoạch"}));
    expect(screen.getByRole("button",{name:"Hỏi Gemini"})).toBeTruthy();
  });
  it("Plan prioritizes ledger facts, without irrelevant Goal selection or a misleading input example",()=>{
    render(<GeminiVaultExplainer locale="vi" goals={[goal]}
      facts={{...facts,contributed:560,yearRecorded:560,yearPlanned:600}}/>);
    const text=document.body.textContent?.replaceAll("\u00a0"," ") || "";
    expect(text).toContain("Đã ghi góp 560,00 €");
    expect(text).toContain("Năm nay ghi 560,00 €, dự kiến 600,00 €");
    expect(text).toContain("Số góp ghi trong sổ còn thấp hơn kế hoạch");
    expect(screen.queryByLabelText("Chọn Goal cần giải thích")).toBeNull();
    expect(screen.getByRole("textbox").getAttribute("placeholder")).not.toContain("Năm nay");
    expect(screen.getByRole("button",{name:"Hỏi Gemini"})).toBeTruthy();
  });
  it("computes concrete Plan differences locally without inventing a Google answer",()=>{
    render(<GeminiVaultExplainer locale="vi" goals={[goal]}
      facts={{...facts,portfolioValue:521.97,contributed:560,yearRecorded:560,yearPlanned:600}}/>);
    const words=document.body.textContent?.replaceAll("\u00a0"," ") || "";
    expect(words).toContain("Còn thiếu 40,00 € theo sổ");
    expect(words).toContain("Giá trị quỹ trừ tiền đã góp: -38,03 €");
    fireEvent.click(screen.getByRole("button",{name:"Mục tiêu"}));
    expect(screen.queryByText("Giá trị quỹ trừ tiền đã góp")).toBeNull();
    expect(screen.queryByRole("button",{name:"Hỏi Gemini"})).toBeNull();
  });
  it("shows only the outgoing aggregates for the selected topic",()=>{
    render(<GeminiVaultExplainer locale="vi" goals={[goal]} facts={facts}/>);
    expect(document.body.textContent).toContain("Đã ghi trong năm");
    expect(document.body.textContent).toContain("Kế hoạch tới hôm nay");
    fireEvent.click(screen.getByRole("button",{name:"Góp tháng"}));
    expect(screen.getByText("Góp mỗi tháng")).toBeTruthy();
    expect(screen.queryByText("Tổng đã góp")).toBeNull();
    expect(screen.queryByText("Đã ghi trong năm")).toBeNull();
    expect(screen.queryByText("Năm mô phỏng")).toBeNull();
    fireEvent.click(screen.getByRole("button",{name:"Mô phỏng"}));
    expect(screen.getByText("Năm mô phỏng")).toBeTruthy();
    expect(screen.getByText("Thận trọng")).toBeTruthy();
    expect(screen.getByText("Lạc quan")).toBeTruthy();
    expect(screen.queryByText("Tổng đã góp")).toBeNull();
  });
  it("marks typed Year question as the effective topic even while Plan was selected",()=>{
    render(<GeminiVaultExplainer locale="vi" goals={[goal]}
      facts={{...facts,contributed:560,yearRecorded:560,yearPlanned:600}}/>);
    fireEvent.change(screen.getByRole("textbox"),{target:{value:"Năm nay tôi góp đủ chưa?"}});
    expect(screen.getByText(/Nhận diện câu hỏi/)).toBeTruthy();
    expect(screen.getByRole("button",{name:"Năm nay"}).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button",{name:"Kế hoạch"}).getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByRole("button",{name:"Hỏi Gemini"})).toBeNull();
    fireEvent.click(screen.getByRole("button",{name:"Kế hoạch"}));
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("");
    expect(screen.getByRole("button",{name:"Hỏi Gemini"})).toBeTruthy();
  });
  it("requires an explicit selected Goal for Gemini Goal, but not Plan or other topics",()=>{
    render(<GeminiVaultExplainer locale="vi" goals={[goal]} facts={facts}/>);
    fireEvent.click(screen.getByRole("button",{name:"Mục tiêu"}));
    expect(screen.getByLabelText("Chọn Goal cần giải thích")).toBeTruthy();
    expect(document.body.textContent).toContain("Hãy chọn Goal trước khi hỏi Gemini");
    expect(screen.queryByRole("button",{name:"Hỏi Gemini"})).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(document.body.textContent).not.toContain("Các con số sẽ gửi");
    expect(document.body.textContent).not.toContain("AI sẵn sàng để hỏi");
    fireEvent.change(screen.getByLabelText("Chọn Goal cần giải thích"),
      {target:{value:"test-goal"}});
    expect(document.body.textContent).toContain("2038");
    expect(screen.getByRole("button",{name:"Hỏi Gemini"})).toBeTruthy();
    expect(screen.getByRole("checkbox")).toBeTruthy();
    expect(document.body.textContent).toContain("Các con số sẽ gửi");
    fireEvent.click(screen.getByRole("button",{name:"Kế hoạch"}));
    expect(screen.queryByLabelText("Chọn Goal cần giải thích")).toBeNull();
    expect(document.body.textContent).not.toContain("Goal đã chọn");
    fireEvent.click(screen.getByRole("button",{name:"Mục tiêu"}));
    expect((screen.getByLabelText("Chọn Goal cần giải thích") as HTMLSelectElement).value).toBe("test-goal");
  });
  it("shows unsupported question feedback instead of silently hiding why AI is unavailable",()=>{
    render(<GeminiVaultExplainer locale="de" goals={[goal]} facts={facts}/>);
    fireEvent.change(screen.getByRole("textbox"),{target:{value:"zzzzzz unklar"}});
    expect(document.body.textContent).toContain("Frage nicht erkannt");
    expect(screen.getByRole("button",{name:"KI fragen"}).hasAttribute("disabled")).toBe(true);
  });
  it("does not enable a provider request simply because user checked consent",()=>{
    render(<GeminiVaultExplainer locale="de" goals={[]} facts={facts}/>);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("button",{name:"KI fragen"}).hasAttribute("disabled")).toBe(true);
  });
});
