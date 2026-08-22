// @vitest-environment jsdom

import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import SettingsClarityWorkspace from "./SettingsClarityWorkspace";
import type { AppSettings } from "../lib/types";

const settings: AppSettings = {
  startDate: "2026-01-15",
  endDate: "2028-06-30",
  contributionY1: 100,
  contributionY2: 150,
  trackInAppCash: false,
  planTarget: { targetUseDate: "2028-06-30", needFullAmount: false, partialNeedEuro: 2500 },
} as AppSettings;

function renderWorkspace() {
  const onOpenVaultAction = vi.fn();
  const onChangeTarget = vi.fn();
  render(createElement(SettingsClarityWorkspace, {
    settings,
    transactions: [],
    locale: "vi",
    saveLabel: "Đã lưu trên thiết bị này",
    syncLabel: "Chỉ trên thiết bị này",
    syncing: false,
    lastSync: null,
    onSync: vi.fn(),
    onChangeTarget,
    onOpenVaultAction,
    onTheme: vi.fn(),
    onLocale: vi.fn(),
  }));
  return { onOpenVaultAction, onChangeTarget };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("SettingsClarityWorkspace", () => {
  it("uses a selected-year plan board with real plan inputs instead of allocation or trade guidance", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-22T12:00:00"));
    renderWorkspace();

    fireEvent.click(screen.getByRole("button", { name: "Kế hoạch" }));
    expect(screen.getByRole("heading", { name: "Một năm. Một bức tranh rõ." })).toBeTruthy();
    expect(document.querySelector(".clarity-year-switcher button.current")?.textContent).toContain("2026");
    expect(screen.getByText("Theo Sparplan")).toBeTruthy();
    expect(screen.getByText("Đã ghi nhận")).toBeTruthy();
    expect(screen.getByText("Nhịp góp")).toBeTruthy();
    expect((screen.getByLabelText("Số tiền dự kiến cần dùng") as HTMLInputElement).value).toBe("2500");
    expect(document.body.textContent).not.toMatch(/Mua|Bán|Chuyển.*%|Mục tiêu cổ phiếu|Dừng góp/);
  });

  it("wires the Vault list to real parent actions", () => {
    const { onOpenVaultAction } = renderWorkspace();
    fireEvent.click(screen.getByRole("button", { name: "Vault" }));
    fireEvent.click(screen.getByRole("button", { name: /Chẩn đoán đồng bộ/ }));
    expect(onOpenVaultAction).toHaveBeenCalledWith("diagnostics");
  });
});
