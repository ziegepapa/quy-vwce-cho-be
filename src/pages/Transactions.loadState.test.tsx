// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

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
vi.mock("../components/TradeRepublicPdfImport", () => ({ default: () => null }));

import Transactions from "./Transactions";

beforeEach(() => {
  vi.clearAllMocks();
  dbMocks.deleteTransaction.mockResolvedValue(undefined);
  dbMocks.getSettings.mockResolvedValue({ trackInAppCash: false });
  dbMocks.listQuotes.mockResolvedValue([]);
  dbMocks.upsertInstrument.mockResolvedValue(undefined);
  dbMocks.upsertTransaction.mockResolvedValue(undefined);
});

afterEach(() => cleanup());

describe("Transactions load and empty states", () => {
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
