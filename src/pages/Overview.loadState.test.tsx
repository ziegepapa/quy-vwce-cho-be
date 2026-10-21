// @vitest-environment jsdom

import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { defaultSettings } from "../lib/defaults";
import { LOCALE_KEY, LocaleProvider } from "../lib/locale";

const dbMocks = vi.hoisted(() => ({
  getSettings: vi.fn(),
  listQuotes: vi.fn(),
  listTransactions: vi.fn(),
  db: { appMetadata: { get: vi.fn() } },
}));

vi.mock("../lib/db", () => dbMocks);

import Overview from "./Overview";

function renderOverview() {
  return render(createElement(MemoryRouter, null, createElement(Overview)));
}

function renderGermanOverview() {
  window.localStorage.setItem(LOCALE_KEY, "de");
  return render(createElement(MemoryRouter, null, createElement(LocaleProvider, null, createElement(Overview))));
}

const TX_STAMP = "2026-08-01T00:00:00.000Z";
const MISSING_PRICE_ISIN = "IE00B5BMR087";

function buyVwce(id: string, date: string) {
  return {
    id,
    date,
    type: "buy_vwce" as const,
    amount: 100,
    quantity: 1,
    unitPrice: 100,
    fee: 0,
    tax: 0,
    notes: "",
    createdAt: TX_STAMP,
    updatedAt: TX_STAMP,
  };
}

function buyWithoutPrice(id: string, date: string) {
  return {
    id,
    date,
    type: "buy_security",
    instrumentIsin: MISSING_PRICE_ISIN,
    amount: 400,
    quantity: 5,
    unitPrice: 80,
    fee: 0,
    tax: 0,
    notes: "",
    createdAt: TX_STAMP,
    updatedAt: TX_STAMP,
  };
}

function buyMissingQuoteComplete(id: string, date: string) {
  return { ...buyWithoutPrice(id, date), notes: "Đã kiểm tra" };
}

function quoteVwce(price: number, asOf: string) {
  return {
    id: `quote-${asOf}`, instrumentIsin: "IE00BK5BQT80", currency: "EUR",
    price, asOf, source: "manual", createdAt: TX_STAMP, updatedAt: TX_STAMP,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  dbMocks.listQuotes.mockResolvedValue([]);
  dbMocks.listTransactions.mockResolvedValue([]);
  dbMocks.db.appMetadata.get.mockResolvedValue({ lastBackupAt: "" });
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const points = url.includes("IE000VAHT5T0")
      ? [
          { date: "2026-10-19", price: 4.401 },
          { date: "2026-10-20", price: 4.39 },
        ]
      : [
          { date: "2026-10-19", price: 170.88 },
          { date: "2026-10-20", price: 170.36 },
        ];
    return { ok: true, json: async () => ({ points }) } as Response;
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.removeItem(LOCALE_KEY);
  window.localStorage.removeItem("vwce.overview.metric.v1");
});

describe("Overview load state", () => {
  it("announces loading without rendering a partial overview", async () => {
    let resolveSettings: (value: unknown) => void = () => undefined;
    dbMocks.getSettings.mockReturnValue(new Promise((resolve) => { resolveSettings = resolve; }));

    renderOverview();

    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-busy")).toBe("true");
    expect(status.getAttribute("aria-label")).toBe("Đang tải Tổng quan");
    expect(document.querySelector(".ovb2")).toBeNull();

    resolveSettings(defaultSettings());
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
  });

  it("shows a fail-closed error and retries the local read", async () => {
    dbMocks.getSettings.mockRejectedValueOnce(new Error("indexeddb offline")).mockResolvedValueOnce(defaultSettings());

    renderOverview();

    expect(await screen.findByRole("heading", { name: "Không tải được Tổng quan" })).toBeTruthy();
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(document.querySelector(".ovb2")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));

    await waitFor(() => expect(document.querySelector(".ovb2")).toBeTruthy());
    expect(dbMocks.getSettings).toHaveBeenCalledTimes(2);
    expect(dbMocks.listTransactions).toHaveBeenCalledTimes(2);
  });
});

describe("Overview German locale", () => {
  it("keeps the portfolio labels German and the metric selector bilingual", async () => {
    dbMocks.getSettings.mockResolvedValue(defaultSettings());
    dbMocks.listTransactions.mockResolvedValue([buyVwce("tx-de-1", "2026-08-01")]);
    dbMocks.listQuotes.mockResolvedValue([quoteVwce(110, "2026-08-19")]);

    renderGermanOverview();

    expect(await screen.findByText("Gesamtvermögen")).toBeTruthy();
    expect(screen.getByText(/Nächster Meilenstein/)).toBeTruthy();
    expect(screen.getByLabelText("Zu beachten")).toBeTruthy();
    expect(screen.getByLabelText("Jahresrückblick")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Bericht exportieren" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Metrik / Chỉ số" })).toBeTruthy();
    expect(document.body.textContent).toContain("Seit Kauf relativ");
    expect(document.body.textContent).toContain("Từ lúc mua · %");
    expect(document.body.textContent).not.toMatch(/Tổng giá trị|Cột mốc tiếp theo|Cần chú ý|Tổng kết năm|Xuất báo cáo|Đã góp|Thị trường thêm/);
  });
});

describe("Overview bản 2", () => {
  it("renders the hero with total, contributions and real gain", async () => {
    dbMocks.getSettings.mockResolvedValue(defaultSettings());
    dbMocks.listTransactions.mockResolvedValue([buyVwce("tx-hero-1", "2026-08-01")]);
    dbMocks.listQuotes.mockResolvedValue([quoteVwce(150, "2026-08-19")]);

    const { container } = renderOverview();

    await waitFor(() => expect(container.querySelector(".ovb2-hero")).toBeTruthy());
    expect(container.querySelector(".ovb2-big")?.textContent).toContain("150,00");
    // Composition: contributed vs real gain, never a single "growth" number.
    const comp = container.querySelector(".ovb2-comp")?.textContent ?? "";
    expect(comp).toContain("Bạn đã góp");
    expect(comp).toContain("100,00");
    expect(comp).toContain("Thị trường thêm");
    expect(comp).toContain("+50,00");
  });

  it("draws the honest two-line chart: value vs contributions", async () => {
    dbMocks.getSettings.mockResolvedValue(defaultSettings());
    dbMocks.listTransactions.mockResolvedValue([
      buyVwce("tx-ch-1", "2026-07-15"),
      buyVwce("tx-ch-2", "2026-08-15"),
      buyVwce("tx-ch-3", "2026-09-15"),
    ]);
    dbMocks.listQuotes.mockResolvedValue([quoteVwce(110, "2026-09-30")]);

    const { container } = renderOverview();

    await waitFor(() => expect(container.querySelector(".ovb2-chart")).toBeTruthy());
    expect(screen.getByText("Giá trị vs Đã góp")).toBeTruthy();
    // Two lines: solid value + dashed contributions.
    const paths = container.querySelectorAll(".ovb2-chart path");
    expect(paths.length).toBeGreaterThanOrEqual(2);
    expect(container.querySelector(".ovb2-chart [stroke-dasharray]")).toBeTruthy();
  });

  it("shows the next value milestone without a fixed target or 2042", async () => {
    dbMocks.getSettings.mockResolvedValue(defaultSettings());
    dbMocks.listTransactions.mockResolvedValue([buyVwce("tx-ms-1", "2026-08-01")]);
    dbMocks.listQuotes.mockResolvedValue([quoteVwce(110, "2026-08-19")]);

    const { container } = renderOverview();

    await waitFor(() => expect(container.querySelector(".ovb2-mile")).toBeTruthy());
    expect(screen.getByText(/Cột mốc tiếp theo/)).toBeTruthy();
    expect(container.querySelector(".ovb2-mile")?.textContent).toContain("1.000");
    // No fixed target date, no 2042 framing anywhere on the page.
    expect(document.body.textContent).not.toContain("2042");
    expect(document.body.textContent).not.toMatch(/Mục tiêu dài hạn|Đã đạt .*% · vào/);
  });

  it("makes overview action labels navigate to existing pages", async () => {
    dbMocks.getSettings.mockResolvedValue(defaultSettings());
    dbMocks.listTransactions.mockResolvedValue([buyVwce("tx-actions-1", "2026-08-01")]);
    dbMocks.listQuotes.mockResolvedValue([quoteVwce(110, "2026-08-19")]);

    const { container } = renderOverview();

    const detailsLink = await screen.findByRole("link", { name: "Xem chi tiết →" });
    const historyLink = await screen.findByRole("link", { name: "Xem lịch sử đầy đủ →" });
    await waitFor(() => expect(container.querySelector(".ovb2-mile")).toBeTruthy());

    expect(detailsLink.getAttribute("href")).toBe("/transactions");
    expect(historyLink.getAttribute("href")).toBe("/timeline");
    const milestoneLink = container.querySelector<HTMLAnchorElement>(".ovb2-mile");
    expect(milestoneLink?.tagName).toBe("A");
    expect(milestoneLink?.getAttribute("href")).toBe("/goals");
  });

  it("lists current holding value and gain/loss since purchase without changing the total", async () => {
    dbMocks.getSettings.mockResolvedValue(defaultSettings());
    dbMocks.listTransactions.mockResolvedValue([
      buyVwce("tx-tbl-1", "2026-08-01"),
      {
        id: "tx-tbl-vall", date: "2026-10-15", type: "buy_security",
        instrumentIsin: "IE000VAHT5T0", amount: 120, quantity: 28.436,
        unitPrice: 4.22, fee: 0, tax: 0, notes: "",
        createdAt: TX_STAMP, updatedAt: TX_STAMP,
      },
    ]);
    dbMocks.listQuotes.mockResolvedValue([
      quoteVwce(170.94, "2026-10-15"),
      { ...quoteVwce(4.4045, "2026-10-15"), id: "q-vall", instrumentIsin: "IE000VAHT5T0" },
    ]);

    const { container } = renderOverview();

    await waitFor(() => expect(container.querySelector(".ovb2-table-card")).toBeTruthy());
    const tableText = container.querySelector(".ovb2-table-card")?.textContent?.replace(/\u00a0/g, " ") ?? "";
    expect(tableText).toContain("VWCE");
    expect(tableText).toContain("VALL");
    expect(tableText).toContain("Vanguard FTSE All-World");
    expect(tableText).toContain("Vanguard FTSE Global All-Cap");
    // The default metric is relative since purchase; the aggregate assets stay unchanged.
    expect(tableText).toContain("+70,9%");
    expect(tableText).toContain("+4,4%");
    expect(container.querySelector(".ovb2-big")?.textContent).toContain("296,19");

    fireEvent.click(screen.getByRole("button", { name: "Metrik / Chỉ số" }));
    expect(screen.getByRole("option", { name: /Seit Kauf absolut/ })).toBeTruthy();
    expect(screen.getByRole("option", { name: /Tagestrend relativ/ })).toBeTruthy();
    expect(screen.getByRole("option", { name: /Tagestrend absolut/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("option", { name: /Seit Kauf absolut/ }));
    const absoluteText = container.querySelector(".ovb2-table-card")?.textContent?.replace(/\u00a0/g, " ") ?? "";
    expect(absoluteText).toContain("+70,94 €");
    expect(absoluteText).toContain("+5,25 €");
    expect(container.querySelector(".ovb2-big")?.textContent).toContain("296,19");
    expect(tableText).not.toContain("VanEck");
  });

  it("shows a clearly labelled negative return when a holding is below cost basis", async () => {
    dbMocks.getSettings.mockResolvedValue(defaultSettings());
    dbMocks.listTransactions.mockResolvedValue([buyVwce("tx-loss-sign", "2026-08-01")]);
    dbMocks.listQuotes.mockResolvedValue([quoteVwce(90, "2026-10-15")]);

    const { container } = renderOverview();

    await waitFor(() => expect(container.querySelector(".ovb2-table-card")).toBeTruthy());
    const lossLabel = container.querySelector(".ovb2-pnl.down")?.textContent?.replace(/\u00a0/g, " ") ?? "";
    expect(lossLabel).toContain("−10,0%");
    expect(container.querySelector(".ovb2-pnl.down")).toBeTruthy();
    expect(container.querySelector(".ovb2-big")?.textContent).toContain("90,00");
  });

  it("switches between daily trend percentage and absolute value using price history", async () => {
    dbMocks.getSettings.mockResolvedValue(defaultSettings());
    dbMocks.listTransactions.mockResolvedValue([buyVwce("tx-day-metric", "2026-08-01")]);
    dbMocks.listQuotes.mockResolvedValue([quoteVwce(170.36, "2026-10-20")]);

    const { container } = renderOverview();
    await waitFor(() => expect(container.querySelector(".ovb2-table-card")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Metrik / Chỉ số" }));
    fireEvent.click(screen.getByRole("option", { name: /Tagestrend relativ/ }));
    await waitFor(() => expect(container.querySelector(".ovb2-pnl.down")?.textContent).toContain("−0,30%"));

    fireEvent.click(screen.getByRole("button", { name: "Metrik / Chỉ số" }));
    fireEvent.click(screen.getByRole("option", { name: /Tagestrend absolut/ }));
    await waitFor(() => expect(container.querySelector(".ovb2-pnl.down")?.textContent?.replace(/\u00a0/g, " ")).toContain("−0,52 €"));
  });

  it("renders one merged attention list that links to the existing review surfaces", async () => {
    dbMocks.getSettings.mockResolvedValue(defaultSettings());
    dbMocks.listTransactions.mockResolvedValue([buyVwce("tx-health", "2026-08-01")]);
    dbMocks.listQuotes.mockResolvedValue([quoteVwce(110, "2026-08-19")]);

    const { container } = renderOverview();

    await waitFor(() => expect(container.querySelector(".ovb2-attention")).toBeTruthy());
    expect(screen.getByLabelText("Cần chú ý")).toBeTruthy();
    const links = container.querySelectorAll<HTMLAnchorElement>(".ovb2-attention a");
    expect(links).toHaveLength(2);
    expect(links[0]?.getAttribute("href")).toBe("#/transactions?quality=needs_review");
    expect(links[0]?.textContent).toContain("1 mục dữ liệu cần rà soát");
    expect(links[1]?.getAttribute("href")).toBe("#/settings");
    expect(links[1]?.textContent).toContain("Chưa ghi nhận sao lưu");
  });

  it("uses precise missing-notes wording when Data Health only has missing notes", async () => {
    dbMocks.getSettings.mockResolvedValue(defaultSettings());
    dbMocks.db.appMetadata.get.mockResolvedValue({ lastBackupAt: "2026-08-01T00:00:00Z" });
    dbMocks.listTransactions.mockResolvedValue([
      buyVwce("tx-note-1", "2026-08-01"),
      buyVwce("tx-note-2", "2026-08-02"),
    ]);
    dbMocks.listQuotes.mockResolvedValue([quoteVwce(110, "2026-08-19")]);
    const { container } = renderOverview();
    await waitFor(() => expect(container.querySelector(".ovb2-attention")).toBeTruthy());
    expect(container.textContent).toContain("2 ghi chú còn thiếu");
    expect(container.textContent).not.toContain("2 mục dữ liệu cần rà soát");
  });

  it("routes a missing-price attention signal to Settings when transaction data is complete", async () => {
    dbMocks.getSettings.mockResolvedValue(defaultSettings());
    dbMocks.listTransactions.mockResolvedValue([buyMissingQuoteComplete("tx-missing-price", "2026-08-01")]);

    const { container } = renderOverview();

    await waitFor(() => expect(container.querySelector(".ovb2-attention")).toBeTruthy());
    expect(screen.getByRole("link", { name: /Thiếu giá cho 1 mã/ }).getAttribute("href")).toBe("#/settings");
  });

  it("keeps a factual gain state in the hero", async () => {
    dbMocks.getSettings.mockResolvedValue(defaultSettings());
    dbMocks.listTransactions.mockResolvedValue([buyVwce("tx-gain", "2026-08-01")]);
    dbMocks.listQuotes.mockResolvedValue([quoteVwce(150, "2026-08-19")]);

    const { container } = renderOverview();

    await waitFor(() => expect(container.querySelector(".ovb2-comp")).toBeTruthy());
    expect(container.querySelector(".ovb2-comp")?.textContent).toContain("+50,00");
    expect(container.querySelector(".ovb2-comp .up")).toBeTruthy();
  });

  it("marks gain as unavailable instead of inventing it without a quote", async () => {
    dbMocks.getSettings.mockResolvedValue(defaultSettings());
    dbMocks.listTransactions.mockResolvedValue([buyVwce("tx-unvalued", "2026-08-01")]);

    const { container } = renderOverview();

    await waitFor(() => expect(container.querySelector(".ovb2-hero")).toBeTruthy());
    expect(container.querySelector(".ovb2-comp")?.textContent).toContain("Chưa định giá");
  });

  it("shows recent updates with correct fund names and prices", async () => {
    dbMocks.getSettings.mockResolvedValue(defaultSettings());
    dbMocks.listTransactions.mockResolvedValue([buyVwce("tx-upd-1", "2026-08-01")]);
    dbMocks.listQuotes.mockResolvedValue([quoteVwce(110, "2026-08-19")]);

    const { container } = renderOverview();

    await waitFor(() => expect(container.querySelector(".ovb2-updates")).toBeTruthy());
    expect(screen.getByText(/Cập nhật gần nhất/)).toBeTruthy();
    expect(container.querySelector(".ovb2-updates")?.textContent).toContain("VWCE: 110,00 €");
  });
});
