// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { defaultNotfallmappe } from "../lib/defaults";
import type { AppSettings } from "../lib/types";

const dbMocks = vi.hoisted(() => ({
  getSettings: vi.fn(),
  listGoals: vi.fn(),
  listQuotes: vi.fn(),
  listTransactions: vi.fn(),
  saveSettings: vi.fn(),
}));

vi.mock("../lib/db", () => dbMocks);
vi.mock("../lib/recoveryReadOnly", () => ({
  useRecoveryReadOnly: () => ({ readOnly: false, showBlocked: vi.fn() }),
}));
vi.mock("../lib/printNotfallmappe", () => ({ printNotfallmappe: vi.fn() }));

import NotfallmappePage from "./Notfallmappe";

const VWCE_ISIN = "IE00BK5BQT80";
const VALL_ISIN = "IE000VAHT5T0";
const TODAY = new Date().toISOString().slice(0, 10);
const STAMP = `${TODAY}T10:00:00.000Z`;

function loadedSettings(): AppSettings {
  return {
    childName: "Bé",
    latestVwcePrice: 118.69,
    latestPriceDate: TODAY,
    notfallmappe: defaultNotfallmappe(),
  } as unknown as AppSettings;
}

function quote(isin: string, price: number) {
  return {
    id: `${isin}|EUR`,
    instrumentIsin: isin,
    currency: "EUR",
    venue: "XETRA",
    price,
    asOf: TODAY,
    source: "auto",
    fetchedAt: STAMP,
    createdAt: STAMP,
    updatedAt: STAMP,
  };
}

function buy(id: string, date: string, type: string, isin: string, amount: number, quantity: number, unitPrice: number) {
  return {
    id,
    date,
    type,
    amount,
    quantity,
    unitPrice,
    instrumentIsin: isin,
    createdAt: `${date}T10:00:00.000Z`,
    updatedAt: `${date}T10:00:00.000Z`,
    source: "manual",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  dbMocks.getSettings.mockResolvedValue(loadedSettings());
  dbMocks.listGoals.mockResolvedValue([]);
  dbMocks.saveSettings.mockResolvedValue(undefined);
  // Sổ chỉ có lệnh mua, không có khoản nạp nào (cash_in): đúng sổ thật của user.
  dbMocks.listTransactions.mockResolvedValue([
    buy("tx-vwce-1", "2026-08-02", "buy_vwce", VWCE_ISIN, 120, 1, 120),
    buy("tx-vwce-2", "2026-09-02", "buy_vwce", VWCE_ISIN, 120, 1, 120),
    buy("tx-vwce-3", "2026-10-02", "buy_vwce", VWCE_ISIN, 120, 1, 120),
    buy("tx-vall-1", "2026-11-02", "buy_security", VALL_ISIN, 120, 30, 4),
    buy("tx-vall-2", "2026-11-16", "buy_security", VALL_ISIN, 120, 30, 4),
  ]);
  dbMocks.listQuotes.mockResolvedValue([
    quote(VWCE_ISIN, 118.69),
    quote(VALL_ISIN, 3.9317),
  ]);
});

afterEach(() => cleanup());

describe("Notfallmappe snapshot total", () => {
  it("shows the securities value at latest prices, never the phantom negative cash", async () => {
    // 3 VWCE × 118,69 € = 356,07 €; 60 VALL × 3,9317 € = 235,90 €; tổng 591,97 €.
    // Code cũ cộng tiền mặt replay −600 € nên in ra −3,93 €.
    render(createElement(NotfallmappePage));

    expect(await screen.findByText("591,97 €")).toBeTruthy();
    // Intl dùng non-breaking space trước € — chuẩn hóa trước khi so.
    const cells = [...document.querySelectorAll(".nfm-snap-v")].map((el) => (el.textContent ?? "").replace(/\u00A0/g, " "));
    expect(cells).toEqual(["591,97 €", "3", "118,69 €", "5"]);
  });
});
