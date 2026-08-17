// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const RAW_PAYLOAD_CANARY = "RAW_PAYLOAD_CANARY_DO_NOT_RENDER";
const FILE_CONTENT = `{"schemaVersion":3,"exportedAt":"2026-08-10T09:08:07Z","canary":"${RAW_PAYLOAD_CANARY}"}`;

const dbMocks = vi.hoisted(() => ({
  clearAllData: vi.fn(),
  exportBackup: vi.fn(),
  importBackup: vi.fn(),
  getSettings: vi.fn(),
  getOrCreateChecklist: vi.fn(),
  listTransactions: vi.fn(),
  saveSettings: vi.fn(),
  db: {
    appMetadata: { get: vi.fn() },
    annualChecklists: { put: vi.fn() },
  },
}));
const engineMocks = vi.hoisted(() => ({
  listDeadOutbox: vi.fn(),
  pushOutbox: vi.fn(),
  reviveDeadOutbox: vi.fn(),
}));

vi.mock("../lib/db", () => dbMocks);
vi.mock("../lib/sync/engine", () => engineMocks);
vi.mock("../lib/calc", () => ({
  csvEscape: (value: unknown) => String(value ?? ""),
  formatDateVN: (value: string) => value,
  parseDecimal: (value: string) => Number(value),
}));
vi.mock("../lib/theme", () => ({
  THEME_OPTIONS: [{ value: "system", label: "H\u1ec7 th\u1ed1ng" }],
  persistTheme: vi.fn(),
  readTheme: () => "system",
}));
vi.mock("../lib/types", () => ({
  APP_VERSION: "test",
  BACKUP_SCHEMA_VERSION: 4,
  SCHEMA_VERSION: 4,
}));
vi.mock("../lib/auth", () => ({ useAuth: () => ({ user: null, mfaEnrolled: false }) }));
vi.mock("../components/SettingsPricePanel", () => ({ default: () => null }));
vi.mock("../components/SyncConflictSection", () => ({ default: () => null }));
vi.mock("../components/PlanRoadmapSection", () => ({ default: () => null }));

import SettingsPage from "./Settings";

const SETTINGS = {
  id: "settings",
  planName: "K\u1ebf ho\u1ea1ch",
  childName: "B\u00e9",
  accountType: "parent",
  trackInAppCash: false,
  inflationRate: 0.02,
  bufferPct: 0.1,
  vwceReturn: 0.07,
  safeReturn: 0.02,
  endMode: "hard",
};

function renderSettings(onOpenMigrate = vi.fn(), onReload = vi.fn()) {
  return render(
    createElement(
      MemoryRouter,
      { initialEntries: ["/settings?tab=data"] },
      createElement(SettingsPage, { onReload, onOpenMigrate }),
    ),
  );
}

function makeFile(name: string, content = FILE_CONTENT) {
  const file = new File([content], name, { type: "application/json" });
  Object.defineProperty(file, "text", { value: () => Promise.resolve(content) });
  return file;
}

async function selectFile(container: HTMLElement, file: File) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
  await screen.findByText("Thay d\u1eef li\u1ec7u tr\u00ean thi\u1ebft b\u1ecb b\u1eb1ng file n\u00e0y?");
}

afterEach(() => cleanup());
beforeEach(() => {
  vi.clearAllMocks();
  dbMocks.getSettings.mockResolvedValue(SETTINGS);
  dbMocks.getOrCreateChecklist.mockResolvedValue({ id: "c", year: 2026, items: [], createdAt: "", updatedAt: "" });
  dbMocks.listTransactions.mockResolvedValue([]);
  dbMocks.exportBackup.mockResolvedValue({ exportedAt: "2026-08-11T12:00:00Z", schemaVersion: 4 });
  dbMocks.importBackup.mockResolvedValue(undefined);
  dbMocks.db.appMetadata.get.mockResolvedValue(undefined);
  engineMocks.listDeadOutbox.mockResolvedValue([]);
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:x") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  HTMLAnchorElement.prototype.click = vi.fn();
  window.alert = vi.fn();
});

describe("JSON import confirmation modal", () => {
  it("hi\u1ec3n th\u1ecb nh\u00e3n 'File \u0111\u00e3 ch\u1ecdn' v\u00e0 t\u00ean file \u0111\u00e3 ch\u1ecdn", async () => {
    const { container } = renderSettings();
    await screen.findByText("Nh\u1eadp file JSON");
    await selectFile(container, makeFile("backup-cu.json"));
    expect(screen.getByText("File \u0111\u00e3 ch\u1ecdn")).toBeTruthy();
    expect(screen.getByText("backup-cu.json")).toBeTruthy();
  });

  it("ch\u01b0a g\u1ecdi importBackup tr\u01b0\u1edbc khi x\u00e1c nh\u1eadn", async () => {
    const { container } = renderSettings();
    await screen.findByText("Nh\u1eadp file JSON");
    await selectFile(container, makeFile("backup-cu.json"));
    expect(dbMocks.importBackup).not.toHaveBeenCalled();
  });

  it("'Quay l\u1ea1i' kh\u00f4ng sao l\u01b0u, kh\u00f4ng nh\u1eadp v\u00e0 \u0111\u00f3ng modal", async () => {
    const { container } = renderSettings();
    await screen.findByText("Nh\u1eadp file JSON");
    await selectFile(container, makeFile("backup-cu.json"));
    fireEvent.click(screen.getByRole("button", { name: "Quay l\u1ea1i" }));
    await waitFor(() =>
      expect(screen.queryByText("Thay d\u1eef li\u1ec7u tr\u00ean thi\u1ebft b\u1ecb b\u1eb1ng file n\u00e0y?")).toBeNull(),
    );
    expect(dbMocks.exportBackup).not.toHaveBeenCalled();
    expect(dbMocks.importBackup).not.toHaveBeenCalled();
  });

  it("JSON sai c\u00fa ph\u00e1p: b\u00e1o l\u1ed7i v\u00e0 kh\u00f4ng ch\u1ea1m d\u1eef li\u1ec7u", async () => {
    const onReload = vi.fn();
    const { container } = renderSettings(vi.fn(), onReload);
    await screen.findByText("Nh\u1eadp file JSON");
    await selectFile(container, makeFile("backup-loi.json", "{khong-phai-json"));

    fireEvent.click(screen.getByRole("button", { name: "X\u00e1c nh\u1eadn thay d\u1eef li\u1ec7u tr\u00ean thi\u1ebft b\u1ecb" }));

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith("JSON kh\u00f4ng h\u1ee3p l\u1ec7"));
    expect(dbMocks.exportBackup).not.toHaveBeenCalled();
    expect(dbMocks.importBackup).not.toHaveBeenCalled();
    expect(onReload).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.queryByText("Thay d\u1eef li\u1ec7u tr\u00ean thi\u1ebft b\u1ecb b\u1eb1ng file n\u00e0y?")).toBeNull(),
    );
  });

  it("JSON kh\u00f4ng ph\u1ea3i object: b\u00e1o l\u1ed7i v\u00e0 kh\u00f4ng ch\u1ea1m d\u1eef li\u1ec7u", async () => {
    const onReload = vi.fn();
    const { container } = renderSettings(vi.fn(), onReload);
    await screen.findByText("Nh\u1eadp file JSON");
    await selectFile(container, makeFile("backup-null.json", "null"));

    fireEvent.click(screen.getByRole("button", { name: "X\u00e1c nh\u1eadn thay d\u1eef li\u1ec7u tr\u00ean thi\u1ebft b\u1ecb" }));

    await waitFor(() =>
      expect(window.alert).toHaveBeenCalledWith("C\u1ea5u tr\u00fac backup kh\u00f4ng h\u1ee3p l\u1ec7"),
    );
    expect(dbMocks.exportBackup).not.toHaveBeenCalled();
    expect(dbMocks.importBackup).not.toHaveBeenCalled();
    expect(onReload).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.queryByText("Thay d\u1eef li\u1ec7u tr\u00ean thi\u1ebft b\u1ecb b\u1eb1ng file n\u00e0y?")).toBeNull(),
    );
  });

  it("schemaVersion kh\u00f4ng h\u1ed7 tr\u1ee3: b\u00e1o \u0111\u1ee7 m\u1ecdi phi\u00ean b\u1ea3n v\u00e0 kh\u00f4ng ch\u1ea1m d\u1eef li\u1ec7u", async () => {
    const onReload = vi.fn();
    const { container } = renderSettings(vi.fn(), onReload);
    await screen.findByText("Nh\u1eadp file JSON");
    await selectFile(
      container,
      makeFile(
        "backup-schema-999.json",
        JSON.stringify({ schemaVersion: 999, exportedAt: "2026-08-10T09:08:07Z" }),
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "X\u00e1c nh\u1eadn thay d\u1eef li\u1ec7u tr\u00ean thi\u1ebft b\u1ecb" }));

    await waitFor(() =>
      expect(window.alert).toHaveBeenCalledWith(
        "schemaVersion kh\u00f4ng kh\u1edbp (file: 999; h\u1ed7 tr\u1ee3: 1, 2, 3 ho\u1eb7c 4)",
      ),
    );
    expect(dbMocks.exportBackup).not.toHaveBeenCalled();
    expect(dbMocks.importBackup).not.toHaveBeenCalled();
    expect(onReload).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.queryByText("Thay d\u1eef li\u1ec7u tr\u00ean thi\u1ebft b\u1ecb b\u1eb1ng file n\u00e0y?")).toBeNull(),
    );
  });

  it("x\u00e1c nh\u1eadn: sao l\u01b0u tr\u01b0\u1edbc r\u1ed3i m\u1edbi g\u1ecdi importBackup", async () => {
    const onReload = vi.fn();
    const { container } = renderSettings(vi.fn(), onReload);
    await screen.findByText("Nh\u1eadp file JSON");
    await selectFile(container, makeFile("backup-cu.json"));
    fireEvent.click(screen.getByRole("button", { name: "X\u00e1c nh\u1eadn thay d\u1eef li\u1ec7u tr\u00ean thi\u1ebft b\u1ecb" }));
    await waitFor(() => expect(dbMocks.importBackup).toHaveBeenCalledTimes(1));
    expect(dbMocks.exportBackup).toHaveBeenCalledTimes(1);
    expect(dbMocks.exportBackup.mock.invocationCallOrder[0]).toBeLessThan(
      dbMocks.importBackup.mock.invocationCallOrder[0],
    );
    await waitFor(() => expect(onReload).toHaveBeenCalledTimes(1));
  });

  it("n\u00fat kh\u00f4i ph\u1ee5c ch\u1ec9 g\u1ecdi onOpenMigrate", async () => {
    const onOpenMigrate = vi.fn();
    renderSettings(onOpenMigrate);
    const button = await screen.findByRole("button", {
      name: /Kh\u00f4i ph\u1ee5c d\u1eef li\u1ec7u \u0111ang c\u00f3 tr\u00ean thi\u1ebft b\u1ecb/,
    });
    fireEvent.click(button);
    expect(onOpenMigrate).toHaveBeenCalledTimes(1);
    expect(dbMocks.importBackup).not.toHaveBeenCalled();
    expect(dbMocks.exportBackup).not.toHaveBeenCalled();
    expect(dbMocks.clearAllData).not.toHaveBeenCalled();
    expect(engineMocks.pushOutbox).not.toHaveBeenCalled();
    expect(engineMocks.reviveDeadOutbox).not.toHaveBeenCalled();
  });

  it("kh\u00f4ng hi\u1ec3n th\u1ecb n\u1ed9i dung file th\u00f4 trong modal", async () => {
    const { container } = renderSettings();
    await screen.findByText("Nh\u1eadp file JSON");
    await selectFile(container, makeFile("backup-cu.json"));
    expect(document.body.innerHTML).not.toContain(RAW_PAYLOAD_CANARY);
    expect(document.body.innerHTML).not.toContain("schemaVersion");
  });
});
