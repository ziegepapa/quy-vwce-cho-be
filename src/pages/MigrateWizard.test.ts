// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const dbMocks = vi.hoisted(() => ({
  countLocalData: vi.fn(),
  exportBackup: vi.fn(),
  listTransactions: vi.fn(),
  db: {
    settings: { toArray: vi.fn() },
    goals: { toArray: vi.fn() },
    transactions: { toArray: vi.fn() },
    annualChecklists: { toArray: vi.fn() },
    monthlySnapshots: { toArray: vi.fn() },
  },
}));

const outboxMocks = vi.hoisted(() => ({
  enqueueOutbox: vi.fn(),
}));

const engineMocks = vi.hoisted(() => ({
  saveSyncMeta: vi.fn(),
}));

vi.mock("../lib/db", () => dbMocks);
vi.mock("../lib/sync/outbox", () => outboxMocks);
vi.mock("../lib/sync/engine", () => engineMocks);
vi.mock("../lib/calc", () => ({
  applyTransaction: (_s: unknown, t: unknown) => t,
  emptyPortfolio: () => ({ totalContributed: 0, vwceQty: 0 }),
  formatMoney: (n: number) => String(n),
}));

import MigrateWizard from "./MigrateWizard";

afterEach(() => cleanup());

beforeEach(() => {
  vi.clearAllMocks();
  dbMocks.countLocalData.mockResolvedValue({
    settings: 1,
    goals: 0,
    transactions: 0,
    annualChecklists: 0,
    monthlySnapshots: 0,
  });
  dbMocks.listTransactions.mockResolvedValue([]);
  dbMocks.exportBackup.mockResolvedValue({
    exportedAt: "2026-08-11T12:00:00.000Z",
    schemaVersion: 1,
  });
  dbMocks.db.settings.toArray.mockResolvedValue([{ id: "settings" }]);
  dbMocks.db.goals.toArray.mockResolvedValue([]);
  dbMocks.db.transactions.toArray.mockResolvedValue([]);
  dbMocks.db.annualChecklists.toArray.mockResolvedValue([]);
  dbMocks.db.monthlySnapshots.toArray.mockResolvedValue([]);
  outboxMocks.enqueueOutbox.mockResolvedValue(undefined);
  engineMocks.saveSyncMeta.mockResolvedValue({});
  // jsdom URL.createObjectURL
  if (!URL.createObjectURL) {
    // @ts-expect-error test polyfill
    URL.createObjectURL = () => "blob:test";
  }
  HTMLAnchorElement.prototype.click = vi.fn();
});

describe("MigrateWizard recovery UX", () => {
  it("shows the primary restore CTA and safe counts only", async () => {
    render(
      createElement(MigrateWizard, {
        userId: "owner-1",
        onDone: vi.fn(),
        onBack: vi.fn(),
      }),
    );

    expect(await screen.findByRole("heading", { name: "Khôi phục dữ liệu trên thiết bị" })).toBeTruthy();
    expect(
      screen.getByText(/Đã tìm thấy dữ liệu trên thiết bị này/),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Khôi phục dữ liệu trên thiết bị" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Quay lại — chưa khôi phục dữ liệu" })).toBeTruthy();
    expect(screen.queryByText(/Notfallmappe|canary|privateValue/i)).toBeNull();
    expect(screen.queryByText("Bắt đầu với kế hoạch mẫu")).toBeNull();
  });

  it("requires explicit confirm before enqueue and does not auto-overwrite", async () => {
    const onDone = vi.fn();
    render(
      createElement(MigrateWizard, {
        userId: "owner-1",
        onDone,
        onBack: vi.fn(),
      }),
    );

    fireEvent.click(await screen.findByRole("button", { name: "Khôi phục dữ liệu trên thiết bị" }));
    expect(await screen.findByRole("button", { name: "Xác nhận khôi phục dữ liệu" })).toBeTruthy();
    expect(outboxMocks.enqueueOutbox).not.toHaveBeenCalled();
    expect(engineMocks.saveSyncMeta).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Xác nhận khôi phục dữ liệu" }));
    await waitFor(() => expect(outboxMocks.enqueueOutbox).toHaveBeenCalled());
    expect(engineMocks.saveSyncMeta).toHaveBeenCalledWith({
      userId: "owner-1",
      migrateWizardDone: true,
      migrateWizardSkipped: false,
    });
    expect(onDone).toHaveBeenCalled();
  });

  it("soft back preserves recovery requirement and does not mark complete", async () => {
    const onBack = vi.fn();
    const onDone = vi.fn();
    render(
      createElement(MigrateWizard, {
        userId: "owner-1",
        onDone,
        onBack,
      }),
    );

    fireEvent.click(await screen.findByRole("button", { name: "Quay lại — chưa khôi phục dữ liệu" }));
    expect(onBack).toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
    expect(engineMocks.saveSyncMeta).not.toHaveBeenCalled();
    expect(outboxMocks.enqueueOutbox).not.toHaveBeenCalled();
    expect(screen.getByText(/Dữ liệu trên thiết bị vẫn được giữ/)).toBeTruthy();
  });
});
