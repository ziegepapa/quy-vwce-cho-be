// @vitest-environment jsdom

import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { LOCALE_KEY, LocaleProvider } from "../lib/locale";
import SettingsPlanStudio from "./SettingsPlanStudio";

function renderStudio(target: { targetUseDate: string; needFullAmount: boolean }) {
  window.localStorage.setItem(LOCALE_KEY, "vi");
  return render(createElement(LocaleProvider, null, createElement(SettingsPlanStudio, {
    target,
    onChangeTarget: vi.fn(),
  })));
}

afterEach(() => {
  cleanup();
  window.localStorage.removeItem(LOCALE_KEY);
});

describe("SettingsPlanStudio", () => {
  it("renders the configured goal date and a non-prescriptive, local plan state", () => {
    renderStudio({ targetUseDate: "2044-06-30", needFullAmount: true });

    expect(screen.getByText("Kế hoạch với điểm xuất phát rõ ràng")).toBeTruthy();
    expect(screen.getAllByText("Ngày cần tiền").length).toBeGreaterThan(1);
    expect(screen.getByText("Thời gian còn lại")).toBeTruthy();
    expect(screen.getAllByText("Gần như toàn bộ danh mục").length).toBeGreaterThan(1);
    expect(document.body.textContent).not.toMatch(/% CK|Mục tiêu cổ phiếu|Mua|Bán|€|₫/);
  });

  it("shows a clear unconfigured state rather than manufacturing a value", () => {
    renderStudio({ targetUseDate: "", needFullAmount: false });

    expect(screen.getAllByText("Chưa thiết lập").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Một phần danh mục").length).toBeGreaterThan(1);
    expect(screen.getByText("Chưa lưu số tiền mục tiêu cho kế hoạch")).toBeTruthy();
  });
});
