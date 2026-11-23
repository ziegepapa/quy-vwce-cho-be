// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import VallHealthPanel from "./VallHealthPanel";

afterEach(()=>{cleanup();vi.restoreAllMocks();});

it("shows sourced Vietnamese VALL metrics, dates and no false green tracking or Sparplan claim",()=>{
  render(<VallHealthPanel locale="vi"/>);
  const panel=screen.getByTestId("vall-health");
  expect(panel.textContent).toContain("FTSE Global All Cap Index");
  expect(panel.textContent).toContain("2.573");
  expect(panel.textContent).toContain("0,07%");
  expect(panel.textContent).toContain("30/09/2026");
  expect(panel.textContent).toContain("Chưa đủ lịch sử 1 năm");
  expect(panel.textContent).toContain("riêng VALL chưa xác minh");
  expect(panel.textContent).toContain("Chưa kiểm tra KHÔNG đồng nghĩa an toàn");
  expect(panel.textContent).toContain("16/01/2027");
  expect(panel.textContent).toContain("16/04/2027");
  expect(panel.textContent).toContain("16/08/2027");
  expect(panel.textContent).toContain("IE00BK5BQT80");
  expect(screen.getAllByRole("link")).toHaveLength(3);
  expect(screen.queryByRole("button")).toBeNull();
});
it("shows German copy without network or Gemini calls",()=>{
  const net=vi.fn();
  vi.stubGlobal("fetch",net);
  render(<VallHealthPanel locale="de"/>);
  expect(screen.getByTestId("vall-health").textContent).toContain("Ungeprüft bedeutet NICHT sicher");
  expect(screen.getByTestId("vall-health").textContent).toContain("VALL-spezifischer Status ungeprüft");
  expect(net).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});
