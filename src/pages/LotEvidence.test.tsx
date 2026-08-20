import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { LocaleProvider } from "../lib/locale";
import LotEvidence from "./LotEvidence";

describe("P11.1 LotEvidence UI", () => {
  it("renders the Vietnamese fixture-only privacy boundary", () => {
    window.localStorage.setItem("vwce-locale", "vi");
    render(<LocaleProvider><MemoryRouter><LotEvidence /></MemoryRouter></LocaleProvider>);
    expect(screen.getByRole("heading", { name: "Bằng chứng lô" })).toBeTruthy();
    expect(screen.getByText(/Chỉ dùng fixture giả/)).toBeTruthy();
    expect(screen.getByText(/Không tính thuế/)).toBeTruthy();
    expect(screen.getAllByText("Chưa xác định").length).toBeGreaterThan(0);
    expect(screen.queryByText(/secret|999999|FIFO|Vorabpauschale/i)).toBeNull();
  });

  it("renders German copy without Vietnamese mixing", () => {
    window.localStorage.setItem("vwce-locale", "de");
    render(<LocaleProvider><MemoryRouter><LotEvidence /></MemoryRouter></LocaleProvider>);
    expect(screen.getByRole("heading", { name: "Lot-Nachweise" })).toBeTruthy();
    expect(screen.getByText(/Nur synthetische Fixtures/)).toBeTruthy();
    expect(screen.queryByText(/Bằng chứng|Chưa|Không|Mở/)).toBeNull();
  });

  it("provides only an explicit back navigation and no write/confirm controls", () => {
    window.localStorage.setItem("vwce-locale", "vi");
    render(<LocaleProvider><MemoryRouter initialEntries={["/lot-evidence"]}><LotEvidence /></MemoryRouter></LocaleProvider>);
    const back = screen.getByRole("link", { name: /Về bàn giao/ });
    expect(back.getAttribute("href")).toBe("/handoff");
    expect(screen.queryByRole("button")).toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("heading", { name: "Bằng chứng lô" })).toBeTruthy();
  });
});
