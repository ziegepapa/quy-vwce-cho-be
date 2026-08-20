// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { LOCALE_KEY, LocaleProvider } from "../lib/locale";
import { buildSyncHealth } from "./syncHealth";
import { SyncHealthSummary } from "./SyncHealthSummary";

const clean = {
  signedIn: true,
  online: true,
  running: false,
  pending: 0,
  dead: 0,
  conflicts: 0,
  recoveryPending: false,
};

function renderSummary(health = buildSyncHealth(clean), onAction = vi.fn()) {
  return render(createElement(LocaleProvider, null, createElement(SyncHealthSummary, { health, onAction })));
}

afterEach(() => {
  cleanup();
  window.localStorage.removeItem(LOCALE_KEY);
});

describe("SyncHealthSummary", () => {
  it("explains the safe Vietnamese retry path without an automatic conflict resolution", () => {
    renderSummary(buildSyncHealth({ ...clean, dead: 2, pending: 2 }));

    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.getByText("Thử lại không tự chọn cách xử lý xung đột và không tự ghi đè dữ liệu.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Đồng bộ lại" })).toBeTruthy();
  });

  it("renders a fully German conflict warning with a deliberate review action", () => {
    window.localStorage.setItem(LOCALE_KEY, "de");
    renderSummary(buildSyncHealth({ ...clean, conflicts: 2 }));

    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("Die App führt Versionen nicht zusammen und trifft keine Auswahl für Sie.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Konflikte prüfen" })).toBeTruthy();
    expect(screen.queryByText("Ứng dụng không gộp hai phiên bản và không tự chọn thay bạn.")).toBeNull();
  });
});
