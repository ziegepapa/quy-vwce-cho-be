// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import VallHealthPanel from "./VallHealthPanel";
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});

it("shows only three plain-language KPIs, 31 October values and an honest unknown TD",()=>{
  render(<VallHealthPanel locale="vi"/>);
  const p=screen.getByTestId("vall-health");
  expect(p.querySelectorAll(".vh-metrics > div")).toHaveLength(3);
  expect(p.textContent).toContain("Tiền trong quỹ (Total assets)");
  expect(p.textContent).toContain("Phí quỹ mỗi năm (OCF/TER)");
  expect(p.textContent).toContain("Độ lệch so với chỉ số (Tracking difference)");
  expect(p.textContent).toContain("4.353");
  expect(p.textContent).toContain("0,07%");
  expect(p.textContent).toContain("31/10/2026");
  expect(p.textContent).toContain("Chưa đủ bằng chứng để kết luận");
  expect(p.textContent).toContain("QUỸ CỦA BÉ CÓ ỔN KHÔNG?");
  expect(p.textContent).toContain("0/5");
  expect(p.textContent).toContain("sớm nhất từ 08/2027");
  expect(p.textContent).toContain("Không giám sát trực tiếp");
  expect(screen.getAllByRole("link")).toHaveLength(3);
});
it("renders 660→2573→4353 chart with source dates and the Sep→Oct +69% AUM change, not returns",()=>{
  render(<VallHealthPanel locale="vi"/>);
  const p=screen.getByTestId("vall-health");
  expect(p.querySelectorAll(".vh-aum-chart circle")).toHaveLength(3);
  expect(p.textContent).toContain("660");
  expect(p.textContent).toContain("2.573");
  expect(p.textContent).toContain("4.353");
  expect(p.textContent).toContain("31/08/2026");
  expect(p.textContent).toContain("30/09/2026");
  expect(screen.getByTestId("vall-aum-change").textContent).toContain("+69%");
  expect(screen.getByTestId("vall-aum-change").textContent).toContain("không phải lợi nhuận");
  expect(p.textContent).toContain("4.223");
  expect(p.textContent).toContain("Tháng 8: số từ sổ của chủ sở hữu");
  expect(p.textContent).toContain("tháng 10 xác minh ngày 23/11/2026");
});
it("shows six 31 October fund-vs-index characteristics and one-sentence glossary, never performance",()=>{
  render(<VallHealthPanel locale="vi"/>);
  const detail=screen.getByTestId("vall-replication");
  fireEvent.click(detail.querySelector("summary")!);
  const text=detail.textContent??"";
  expect(text).toContain("6.977");
  expect(text).toContain("10.207");
  expect(text).toContain("19,4");
  expect(text).toContain("19,3");
  expect(text).toContain("3,2");
  expect(text).toContain("18,5%");
  expect(text).toContain("19,0%");
  expect(text).toContain("1,6%");
  expect(text).toContain("KHÔNG phải hiệu suất hay tracking difference");
  expect(text).toContain("đối chiếu trực tiếp ngày 23/11/2026");
  expect(detail.querySelectorAll(".vh-replication-row")).toHaveLength(6);
  expect(detail.querySelectorAll(".vh-term > summary")).toHaveLength(6);
});
it("displays owner-reported 0 euro Sparplan and 1 euro single order without verifying VALL broker status",()=>{
  render(<VallHealthPanel locale="vi"/>);
  const fee=screen.getByTestId("vall-tr-fees");
  fireEvent.click(fee.querySelector("summary")!);
  expect(fee.textContent).toContain("Sparplan");
  expect(fee.textContent).toContain("0 €");
  expect(fee.textContent).toContain("Mua lẻ: 1 €");
  expect(fee.textContent).toContain("trạng thái vẫn chưa xác minh");
});
it("has review countdown and evidence timeline without scheduling or network calls",()=>{
  const net=vi.fn();vi.stubGlobal("fetch",net);
  render(<VallHealthPanel locale="vi"/>);
  expect(screen.getByTestId("vall-countdown").textContent).toMatch(/Còn \d+ ngày|Dự kiến hôm nay|Chưa có mốc mới/);
  const txt=screen.getByTestId("vall-health").textContent??"";
  expect(txt).toContain("Giữa 12/2026");
  expect(txt).toContain("Từ 08/2027");
  expect(txt).toContain("Khi Chien xác nhận biên nhận lệnh thật");
  expect(net).not.toHaveBeenCalled();
});
it("keeps German descriptions, all unknown flags and distinct VALL/VWCE benchmarks",()=>{
  render(<VallHealthPanel locale="de"/>);
  const p=screen.getByTestId("vall-health");
  expect(p.textContent).toContain("FTSE Global All Cap Index");
  expect(p.textContent).toContain("FTSE All-World Index");
  expect(p.textContent).toContain("0,14%");
  expect(p.textContent).toContain("VALL-spezifischer Status ungeprüft");
  expect(p.textContent).toContain("Ungeprüft bedeutet NICHT sicher");
  expect(p.textContent).toContain("Oktober am 23.11.2026");
  const unknown=screen.getByRole("button",{name:"Offen (5)"});
  fireEvent.click(unknown);
  expect(unknown.getAttribute("aria-pressed")).toBe("true");
  expect(p.querySelectorAll(".vh-flags li")).toHaveLength(5);
});
