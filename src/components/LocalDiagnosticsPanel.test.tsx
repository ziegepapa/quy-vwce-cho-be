// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { LOCALE_KEY, LocaleProvider } from "../lib/locale";
import { LOCAL_DIAGNOSTICS_STORAGE_KEY } from "./localDiagnostics";
import LocalDiagnosticsPanel from "./LocalDiagnosticsPanel";

function renderPanel() {
  return render(createElement(LocaleProvider, null, createElement(LocalDiagnosticsPanel)));
}

afterEach(() => {
  cleanup();
  window.localStorage.removeItem(LOCALE_KEY);
  window.localStorage.removeItem(LOCAL_DIAGNOSTICS_STORAGE_KEY);
});

describe("LocalDiagnosticsPanel", () => {
  it("renders only safe Vietnamese diagnostics metadata", () => {
    window.localStorage.setItem(LOCAL_DIAGNOSTICS_STORAGE_KEY, JSON.stringify([
      { at: "2026-08-20T12:00:00.000Z", category: "sync-health", code: "offline", message: "SECRET_CANARY" },
    ]));

    renderPanel();

    expect(screen.getByText("Chẩn đoán trên thiết bị")).toBeTruthy();
    expect(screen.getByText("Nhật ký này chỉ nằm trên thiết bị. Nó không chứa số tiền, giao dịch, ghi chú, thông tin tài khoản hoặc nội dung lỗi và không được gửi đi.")).toBeTruthy();
    expect(screen.getByText("Ngoại tuyến")).toBeTruthy();
    expect(document.body.textContent).not.toContain("SECRET_CANARY");
  });

  it("renders a fully German diagnostics surface", () => {
    window.localStorage.setItem(LOCALE_KEY, "de");
    window.localStorage.setItem(LOCAL_DIAGNOSTICS_STORAGE_KEY, JSON.stringify([
      { at: "2026-08-20T12:00:00.000Z", category: "sync-health", code: "conflict" },
    ]));

    renderPanel();

    expect(screen.getByText("Gerätediagnose")).toBeTruthy();
    expect(screen.getByText("Konflikt erfordert Prüfung")).toBeTruthy();
    expect(screen.queryByText("Chẩn đoán trên thiết bị")).toBeNull();
    expect(screen.queryByText("Có xung đột cần xem")).toBeNull();
  });
});
