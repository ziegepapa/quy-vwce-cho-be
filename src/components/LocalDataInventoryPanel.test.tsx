// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { LOCALE_KEY, LocaleProvider } from "../lib/locale";
import { LOCAL_DIAGNOSTICS_STORAGE_KEY } from "./localDiagnostics";

const dbMocks = vi.hoisted(() => ({ countLocalData: vi.fn() }));
vi.mock("../lib/db", () => dbMocks);

import LocalDataInventoryPanel from "./LocalDataInventoryPanel";

const counts = {
  settings: 1,
  goals: 2,
  transactions: 3,
  annualChecklists: 4,
  monthlySnapshots: 5,
  quotes: 6,
};

function renderPanel(locale: "vi" | "de" = "vi") {
  window.localStorage.setItem(LOCALE_KEY, locale);
  return render(createElement(LocaleProvider, null, createElement(LocalDataInventoryPanel)));
}

beforeEach(() => {
  vi.clearAllMocks();
  dbMocks.countLocalData.mockResolvedValue(counts);
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("LocalDataInventoryPanel", () => {
  it("shows only allowlisted count metadata and removes untrusted diagnostic fields", async () => {
    window.localStorage.setItem(LOCAL_DIAGNOSTICS_STORAGE_KEY, JSON.stringify([
      {
        at: "2026-08-20T12:00:00.000Z",
        category: "sync-health",
        code: "offline",
        notes: "INVENTORY_SECRET_CANARY",
      },
    ]));
    renderPanel();

    await screen.findByText("Tổng quan dữ liệu trên thiết bị");
    await waitFor(() => expect(screen.getByText("Checklist và mốc theo tháng").parentElement?.textContent).toContain("9"));
    expect(screen.getByText("Giao dịch").parentElement?.textContent).toContain("3");
    expect(screen.getByText("Sự kiện chẩn đoán local").parentElement?.textContent).toContain("1");
    expect(document.body.textContent).not.toContain("INVENTORY_SECRET_CANARY");
  });

  it("uses pure German privacy copy and labels when Deutsch is selected", async () => {
    renderPanel("de");

    expect(await screen.findByText("Lokale Datenübersicht")).toBeTruthy();
    expect(screen.getByText("Transaktionen")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Übersicht aktualisieren" })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Tổng quan|Giao dịch|Làm mới|Dữ liệu/);
  });

  it("reports a safe localized error without rendering the database failure", async () => {
    dbMocks.countLocalData.mockRejectedValueOnce(new Error("INVENTORY_DB_SECRET_CANARY"));
    renderPanel();

    expect((await screen.findByRole("alert")).textContent).toContain("Không đọc được tổng quan dữ liệu trên thiết bị. Dữ liệu chưa bị thay đổi.");
    expect(document.body.textContent).not.toContain("INVENTORY_DB_SECRET_CANARY");
  });
});
