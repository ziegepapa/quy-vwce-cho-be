// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LOCALE_KEY, LocaleProvider } from "../lib/locale";

const pwaMocks = vi.hoisted(() => ({
  needRefresh: false,
  setNeedRefresh: vi.fn(),
  updateServiceWorker: vi.fn().mockResolvedValue(undefined),
  onRegisteredSW: null as ((swUrl: string, registration?: ServiceWorkerRegistration) => void) | null,
  useRegisterSW: vi.fn(),
}));

vi.mock("virtual:pwa-register/react", () => ({
  useRegisterSW: (options: { onRegisteredSW?: (swUrl: string, registration?: ServiceWorkerRegistration) => void }) => {
    pwaMocks.useRegisterSW(options);
    pwaMocks.onRegisteredSW = options.onRegisteredSW ?? null;
    return {
      needRefresh: [pwaMocks.needRefresh, pwaMocks.setNeedRefresh],
      offlineReady: [false, vi.fn()],
      updateServiceWorker: pwaMocks.updateServiceWorker,
    };
  },
}));

import PwaUpdatePrompt, { requestPwaUpdate } from "./PwaUpdatePrompt";

function renderPrompt(locale: "vi" | "de") {
  window.localStorage.setItem(LOCALE_KEY, locale);
  return render(createElement(LocaleProvider, null, createElement(PwaUpdatePrompt)));
}

beforeEach(() => {
  window.localStorage.clear();
  pwaMocks.needRefresh = false;
  pwaMocks.onRegisteredSW = null;
  pwaMocks.setNeedRefresh.mockReset();
  pwaMocks.updateServiceWorker.mockReset().mockResolvedValue(undefined);
  pwaMocks.useRegisterSW.mockReset();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PwaUpdatePrompt", () => {
  it("stays hidden while there is no waiting service-worker update", () => {
    renderPrompt("vi");
    expect(screen.queryByTestId("pwa-update-prompt")).toBeNull();
  });

  it("renders localized Vietnamese copy and reloads only after explicit owner action", () => {
    pwaMocks.needRefresh = true;
    renderPrompt("vi");

    expect(screen.getByRole("status").textContent).toContain("Có phiên bản ứng dụng mới");
    fireEvent.click(screen.getByRole("button", { name: "Tải lại ngay" }));
    expect(pwaMocks.updateServiceWorker).toHaveBeenCalledWith(true);
  });

  it("renders localized German copy and allows a non-reloading dismissal", () => {
    pwaMocks.needRefresh = true;
    renderPrompt("de");

    expect(screen.getByRole("status").textContent).toContain("Neue App-Version verfügbar");
    fireEvent.click(screen.getByRole("button", { name: "Später" }));
    expect(pwaMocks.setNeedRefresh).toHaveBeenCalledWith(false);
    expect(pwaMocks.updateServiceWorker).not.toHaveBeenCalled();
  });

  it("checks the registered service worker again when the window regains focus", () => {
    renderPrompt("vi");
    const update = vi.fn().mockResolvedValue(undefined);
    const registration = { update } as unknown as ServiceWorkerRegistration;

    act(() => pwaMocks.onRegisteredSW?.("/quy-vwce-cho-be/sw.js", registration));
    update.mockClear();
    act(() => window.dispatchEvent(new Event("focus")));

    expect(update).toHaveBeenCalledTimes(1);
  });

  it("keeps failed update checks out of the UI error path", async () => {
    const update = vi.fn().mockRejectedValue(new Error("offline"));
    requestPwaUpdate({ update } as unknown as ServiceWorkerRegistration);
    await Promise.resolve();
    expect(update).toHaveBeenCalledTimes(1);
  });
});
