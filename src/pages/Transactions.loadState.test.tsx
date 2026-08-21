// @vitest-environment jsdom
import { createElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LOCALE_KEY, LocaleProvider } from "../lib/locale";
import { TRANSACTION_SAVED_VIEWS_KEY } from "./transactionsSavedViews";

const dbMocks = vi.hoisted(() => ({
  deleteTransaction: vi.fn(),
  getSettings: vi.fn(),
  listTransactions: vi.fn(),
  listQuotes: vi.fn(),
  uid: vi.fn(() => "tx-new"),
  upsertInstrument: vi.fn(),
  upsertTransaction: vi.fn(),
}));

vi.mock("../lib/db", () => dbMocks);
vi.mock("../lib/recoveryReadOnly", () => ({
  useRecoveryReadOnly: () => ({ readOnly: false, showBlocked: vi.fn() }),
}));
vi.mock("../components/ActionMenu", () => ({ default: () => null }));
vi.mock("../components/Icons", () => ({ IconPlus: () => null }));
vi.mock("../components/TradeRepublicPdfImport", () => ({ default: () => "pdf-import-loaded" }));

import Transactions from "./Transactions";

beforeEach(() => {
  vi.clearAllMocks();
  dbMocks.deleteTransaction.mockResolvedValue(undefined);
  dbMocks.getSettings.mockResolvedValue({ trackInAppCash: false });
  dbMocks.listQuotes.mockResolvedValue([]);
  dbMocks.upsertInstrument.mockResolvedValue(undefined);
  dbMocks.upsertTransaction.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  window.localStorage.removeItem(LOCALE_KEY);
  window.localStorage.removeItem(TRANSACTION_SAVED_VIEWS_KEY);
});

describe("Transactions load and empty states", () => {
  it("keeps the new journal controls fully German when Deutsch is selected", async () => {
    window.localStorage.setItem(LOCALE_KEY, "de");
    dbMocks.listTransactions.mockResolvedValue([]);
    render(createElement(MemoryRouter, null, createElement(LocaleProvider, null, createElement(Transactions))));

    expect(await screen.findByText("Transaktionsjournal")).toBeTruthy();
    expect(screen.getByRole("group", { name: "Schnellfilter" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Zeitraum" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Gespeicherte Ansichten" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Dieser Monat" })).toBeTruthy();
    expect(screen.getByText("Alle Transaktionen sind vollständig.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Wertpapiere" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Einzahlungen" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "+ VWCE kaufen" })[0]).toBeTruthy();
    expect(document.body.textContent).not.toContain("Nhật ký giao dịch");
    expect(document.body.textContent).not.toContain("Tháng này");
  });

  it("loads the optional PDF importer only after opening tools", async () => {
    dbMocks.listTransactions.mockResolvedValue([]);
    render(createElement(Transactions));

    await screen.findByText("Chưa có giao dịch.");
    expect(screen.queryByText("pdf-import-loaded")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Lọc / PDF" }));
    expect(await screen.findByText("pdf-import-loaded")).toBeTruthy();
  });

  it("uses German validation, date and number presentation for a critical ledger action", async () => {
    window.localStorage.setItem(LOCALE_KEY, "de");
    const alertMock = vi.spyOn(window, "alert").mockImplementation(() => undefined);
    dbMocks.listTransactions.mockResolvedValue([
      { id: "tx-de", date: "2026-08-20", type: "cash_in", amount: 1234.5, notes: "Eigene Notiz", createdAt: "2026-08-20T00:00:00Z", updatedAt: "2026-08-20T00:00:00Z", source: "manual" },
    ]);
    render(createElement(MemoryRouter, null, createElement(LocaleProvider, null, createElement(Transactions))));

    expect(await screen.findByText("20.08.2026")).toBeTruthy();
    expect(screen.getByText(/1\.234,50/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "+ Hinzufügen" }));
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));

    expect(alertMock).toHaveBeenCalledWith("Datum und Betrag sind erforderlich.");
    expect(document.body.textContent).not.toContain("Ngày và số tiền bắt buộc");
    alertMock.mockRestore();
  });

  it("does not claim the ledger is empty while it is still loading", () => {
    dbMocks.listTransactions.mockReturnValue(new Promise(() => undefined));
    render(createElement(Transactions));

    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-busy")).toBe("true");
    expect(status.getAttribute("aria-label")).toBe("Đang tải Giao dịch");
    expect(screen.queryByText("Chưa có giao dịch.")).toBeNull();
  });

  it("shows a fail-closed error and retries the read", async () => {
    dbMocks.listTransactions
      .mockRejectedValueOnce(new Error("IndexedDB unavailable"))
      .mockResolvedValueOnce([]);
    render(createElement(Transactions));

    expect(
      await screen.findByRole("heading", { name: "Không tải được Giao dịch" }),
    ).toBeTruthy();
    expect(screen.queryByText("Chưa có giao dịch.")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));

    expect(await screen.findByText("Chưa có giao dịch.")).toBeTruthy();
    expect(dbMocks.listTransactions).toHaveBeenCalledTimes(2);
  });

  it("renders a bounded 60-row window and progressively expands a 1,000-row ledger", async () => {
    dbMocks.listTransactions.mockResolvedValue(Array.from({ length: 1000 }, (_, index) => ({
      id: `tx-${index}`,
      date: `2026-${String((index % 12) + 1).padStart(2, "0")}-${String((index % 28) + 1).padStart(2, "0")}`,
      type: index % 2 === 0 ? "buy_vwce" : "cash_in",
      amount: 100 + index,
      notes: `large ledger row ${index}`,
      createdAt: "2026-08-13T00:00:00Z",
      updatedAt: "2026-08-13T00:00:00Z",
      source: "manual",
    })));
    render(createElement(Transactions));

    expect(await screen.findByText("Đang hiển thị 60/1000 giao dịch")).toBeTruthy();
    expect(document.querySelectorAll(".tx-item")).toHaveLength(60);

    fireEvent.click(screen.getByRole("button", { name: "Tải thêm 60 giao dịch" }));

    await waitFor(() => expect(document.querySelectorAll(".tx-item")).toHaveLength(120));
    expect(screen.getByText("Đang hiển thị 120/1000 giao dịch")).toBeTruthy();
  });

  it("offers touch-friendly activity filters before opening advanced search tools", async () => {
    dbMocks.listTransactions.mockResolvedValue([
      { id: "tx-buy", date: "2026-08-13", type: "buy_vwce", amount: 100, notes: "VWCE", createdAt: "2026-08-13T00:00:00Z", updatedAt: "2026-08-13T00:00:00Z", source: "manual" },
      { id: "tx-cash", date: "2026-08-12", type: "cash_in", amount: 100, notes: "Góp", createdAt: "2026-08-12T00:00:00Z", updatedAt: "2026-08-12T00:00:00Z", source: "manual" },
    ]);
    render(createElement(Transactions));

    expect(await screen.findByText("Nhật ký giao dịch")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Đầu tư" }));

    expect(document.querySelectorAll(".tx-item")).toHaveLength(1);
    expect(document.querySelector(".tx-item")?.textContent).toContain("Mua VWCE");
    expect(document.querySelector(".tx-item")?.textContent).not.toContain("Góp");
    expect(screen.getByRole("button", { name: "Đầu tư" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("saves, reapplies and removes a local Saved view without changing the ledger", async () => {
    dbMocks.listTransactions.mockResolvedValue([
      { id: "tx-buy", date: "2026-08-20", type: "buy_vwce", amount: 100, notes: "VWCE", createdAt: "2026-08-20T00:00:00Z", updatedAt: "2026-08-20T00:00:00Z", source: "manual" },
    ]);
    render(createElement(Transactions));

    await screen.findByText("Nhật ký giao dịch");
    fireEvent.click(screen.getByRole("button", { name: "Tháng này" }));
    fireEvent.click(screen.getByRole("button", { name: "+ Lưu view" }));
    fireEvent.change(screen.getByLabelText("Tên góc xem"), { target: { value: "Mua gần đây" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu góc xem hiện tại" }));

    const saved = screen.getByRole("button", { name: "Mua gần đây" });
    expect(saved.getAttribute("aria-pressed")).toBe("true");
    expect(JSON.parse(window.localStorage.getItem(TRANSACTION_SAVED_VIEWS_KEY) ?? "[]")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Toàn bộ" }));
    expect(saved.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(saved);
    expect(screen.getByRole("button", { name: "Tháng này" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Xóa góc xem Mua gần đây" }));
    expect(screen.queryByRole("button", { name: "Mua gần đây" })).toBeNull();
    expect(JSON.parse(window.localStorage.getItem(TRANSACTION_SAVED_VIEWS_KEY) ?? "[]")).toHaveLength(0);
  });

  it("bounds the Data quality inbox for a large ledger and reveals issues progressively", async () => {
    dbMocks.listTransactions.mockResolvedValue(Array.from({ length: 1000 }, (_, index) => ({
      id: `quality-${index}`,
      date: "2026-08-20",
      type: "cash_in" as const,
      amount: 100,
      notes: "",
      createdAt: "2026-08-20T00:00:00Z",
      updatedAt: "2026-08-20T00:00:00Z",
      source: "manual" as const,
    })));
    render(createElement(Transactions));

    expect(await screen.findByText("1000 cần rà soát")).toBeTruthy();
    expect(document.querySelectorAll(".tx-quality-item")).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "Xem thêm 997" }));
    expect(document.querySelectorAll(".tx-quality-item")).toHaveLength(6);
  });

  it("opens the affected transaction from the Data quality inbox without inventing missing data", async () => {
    dbMocks.listTransactions.mockResolvedValue([
      { id: "tx-missing-isin", date: "2026-08-20", type: "buy_security", amount: 100, unitPrice: 100, quantity: 1, instrumentIsin: "", notes: "Imported ETF", createdAt: "2026-08-20T00:00:00Z", updatedAt: "2026-08-20T00:00:00Z", source: "manual" },
      { id: "tx-note", date: "2026-08-19", type: "cash_in", amount: 50, notes: "", createdAt: "2026-08-19T00:00:00Z", updatedAt: "2026-08-19T00:00:00Z", source: "manual" },
    ]);
    render(createElement(Transactions));

    expect(await screen.findByText("2 cần rà soát")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Thiếu ISIN/ }));
    expect(screen.getByRole("heading", { name: "Sửa giao dịch" })).toBeTruthy();
    expect((screen.getByLabelText("ISIN") as HTMLInputElement).value).toBe("");
  });

  it("offers Smart time lenses and resets them together with the journal filters", async () => {
    dbMocks.listTransactions.mockResolvedValue([]);
    render(createElement(Transactions));

    await screen.findByText("Nhật ký giao dịch");
    fireEvent.click(screen.getByRole("button", { name: "Tháng này" }));
    expect(screen.getByRole("button", { name: "Tháng này" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Lọc / PDF · 1 bộ lọc" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Lọc / PDF · 1 bộ lọc" }));
    fireEvent.click(screen.getByRole("button", { name: "Xóa lọc" }));
    expect(screen.getByRole("button", { name: "Toàn bộ" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("opens intentional quick-create flows with the matching transaction type preselected", async () => {
    dbMocks.listTransactions.mockResolvedValue([]);
    render(createElement(Transactions));

    await screen.findByText("Chưa có giao dịch.");
    fireEvent.click(screen.getAllByRole("button", { name: "+ Mua VWCE" })[0]);
    expect((screen.getByLabelText("Loại") as HTMLSelectElement).value).toBe("buy_vwce");

    fireEvent.click(screen.getByRole("button", { name: "Hủy" }));
    fireEvent.click(screen.getByRole("button", { name: "+ Góp tiền" }));
    expect((screen.getByLabelText("Loại") as HTMLSelectElement).value).toBe("cash_in");
  });

  it("shows a precise H2-B semantic reason and blocks persistence for a manual oversell", async () => {
    dbMocks.listTransactions.mockResolvedValue([
      {
        id: "buy-held",
        date: "2026-08-01",
        type: "buy_vwce",
        amount: 200,
        unitPrice: 100,
        quantity: 2,
        instrumentIsin: "IE00BK5BQT80",
        notes: "",
        createdAt: "2026-08-01T00:00:00Z",
        updatedAt: "2026-08-01T00:00:00Z",
        source: "manual",
      },
    ]);
    render(createElement(Transactions));

    await screen.findByRole("button", { name: /Mua VWCE, 01\/08\/2026/ });
    fireEvent.click(screen.getByRole("button", { name: "+ Thêm" }));
    fireEvent.change(screen.getByLabelText("Loại"), { target: { value: "sell_vwce" } });
    fireEvent.change(screen.getByLabelText(/Tổng tiền/), { target: { value: "300" } });
    fireEvent.change(screen.getByLabelText(/Số lượng/), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));

    expect((await screen.findByRole("alert")).textContent).toContain("Số lượng bán vượt quá số lượng đang được ghi nhận.");
    expect(dbMocks.upsertTransaction).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Thêm giao dịch" })).toBeTruthy();
  });

  it("distinguishes no filter matches from a genuinely empty ledger", async () => {
    dbMocks.listTransactions.mockResolvedValue([
      {
        id: "tx-1",
        date: "2026-08-13",
        type: "cash_in",
        amount: 100,
        notes: "Khoản góp tháng 8",
        createdAt: "2026-08-13T00:00:00Z",
        updatedAt: "2026-08-13T00:00:00Z",
        source: "manual",
      },
    ]);
    render(createElement(Transactions));

    expect(await screen.findByText(/Khoản góp tháng 8/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Lọc / PDF" }));
    fireEvent.change(screen.getByLabelText("Tìm"), { target: { value: "không khớp" } });

    expect(screen.getByText("Không có giao dịch khớp bộ lọc.")).toBeTruthy();
    expect(screen.queryByText("Chưa có giao dịch.")).toBeNull();
  });
});
