// @vitest-environment jsdom
import { StrictMode, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ConflictRecord, ResolveConflictResult } from "../lib/sync/types";

const engineMocks = vi.hoisted(() => ({
  listConflicts: vi.fn(),
  resolveConflict: vi.fn(),
}));

vi.mock("../lib/sync/engine", () => engineMocks);

import SyncConflictSection from "./SyncConflictSection";
import { LOCALE_KEY, LocaleProvider } from "../lib/locale";

const CANARY = "NOTFALLMAPPE_CONTACT_DOCUMENT_LOCATION_SECRET";
const CONFIRMED_COPY = "Đã giữ dữ liệu trên thiết bị và đồng bộ thành công.";
const PENDING_COPY =
  "Đã giữ dữ liệu trên thiết bị. Thay đổi đang chờ đồng bộ; dữ liệu server chưa bị ghi đè.";
const REPLACEMENT_COPY =
  "Đã lưu lựa chọn trên thiết bị, nhưng trạng thái server đã thay đổi hoặc chưa thể cập nhật an toàn. Không có dữ liệu bị ghi đè. Vui lòng xem xung đột mới.";

function conflict(overrides: Partial<ConflictRecord> = {}): ConflictRecord {
  return {
    id: "conflict-1",
    table: "settings",
    entityId: "settings-1",
    local: { emergencyContact: CANARY },
    remote: { documentLocation: CANARY },
    detectedAt: "2026-08-11T10:00:00.000Z",
    formatVersion: 2,
    remoteVersion: 3,
    remoteUpdatedAt: "2026-08-11T09:59:00.000Z",
    remoteDeletedAt: null,
    localUpdatedAt: "2026-08-11T09:58:00.000Z",
    ...overrides,
  };
}

function renderSection(onResolved = vi.fn(), focusRequest: string | null = null) {
  return render(
    createElement(SyncConflictSection, {
      userId: "owner-1",
      focusRequest,
      onResolved,
    }),
  );
}

async function confirmLocal() {
  fireEvent.click(await screen.findByRole("button", { name: "Giữ dữ liệu trên thiết bị này" }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(
    within(dialog).getByRole("button", {
      name: /Xác nhận giữ dữ liệu trên thiết bị này/,
    }),
  );
}

afterEach(() => {
  cleanup();
  window.localStorage.removeItem(LOCALE_KEY);
});

beforeEach(() => {
  vi.clearAllMocks();
  engineMocks.listConflicts.mockResolvedValue([conflict()]);
  engineMocks.resolveConflict.mockResolvedValue({ status: "resolved-local" });
  HTMLElement.prototype.scrollIntoView = vi.fn();
});

describe("fail-closed conflict reads", () => {
  it("shows a safe initial warning and retries only listConflicts", async () => {
    engineMocks.listConflicts.mockRejectedValueOnce(new Error(`read failed: ${CANARY}`));
    renderSection();

    const readFailure = await screen.findByRole("alert");
    expect(within(readFailure).getByText("Dữ liệu chưa bị thay đổi.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Giữ dữ liệu trên thiết bị này" })).toBeNull();
    expect(document.body.textContent).not.toContain(CANARY);
    expect(engineMocks.resolveConflict).not.toHaveBeenCalled();

    engineMocks.listConflicts.mockResolvedValueOnce([conflict()]);
    fireEvent.click(screen.getByRole("button", { name: "Thử tải lại" }));

    expect(await screen.findByRole("article", { name: "Xung đột Cài đặt" })).toBeTruthy();
    expect(engineMocks.listConflicts).toHaveBeenCalledTimes(2);
    expect(engineMocks.resolveConflict).not.toHaveBeenCalled();
  });

  it("keeps last successful cards disabled when a refresh fails", async () => {
    engineMocks.listConflicts
      .mockResolvedValueOnce([conflict()])
      .mockRejectedValueOnce(new Error(`temporary: ${CANARY}`));
    render(
      createElement(
        StrictMode,
        null,
        createElement(SyncConflictSection, {
          userId: "owner-1",
          onResolved: vi.fn(),
        }),
      ),
    );

    await waitFor(() => expect(engineMocks.listConflicts).toHaveBeenCalledTimes(2));
    const localButton = screen.getByRole("button", { name: "Giữ dữ liệu trên thiết bị này" });
    expect((localButton as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("article", { name: "Xung đột Cài đặt" })).toBeTruthy();
    expect(engineMocks.resolveConflict).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain(CANARY);
  });
});

describe("truthful local outcome feedback", () => {
  it("covers production mismatch: warning plus replacement card, never green", async () => {
    const replacement = conflict({
      id: "replacement-1",
      remoteVersion: 7,
      reasonCategory: "server-version-changed",
      sourceOutboxId: "outbox-1",
      supersedesConflictId: "conflict-1",
    });
    engineMocks.listConflicts
      .mockResolvedValueOnce([conflict()])
      .mockResolvedValueOnce([replacement]);
    engineMocks.resolveConflict.mockResolvedValue({
      status: "resolved-local-pending-conflict",
      reason: "server-version-changed",
    });
    const onResolved = vi.fn().mockResolvedValue(undefined);
    renderSection(onResolved);

    await confirmLocal();

    const warning = await screen.findByText(REPLACEMENT_COPY);
    expect(warning.getAttribute("role")).toBe("alert");
    expect(warning.className).toContain("warning");
    expect(screen.queryByText(CONFIRMED_COPY)).toBeNull();
    expect(await screen.findByRole("article", { name: "Xung đột Cài đặt" })).toBeTruthy();
    expect(engineMocks.resolveConflict).toHaveBeenCalledTimes(1);
    expect(engineMocks.listConflicts).toHaveBeenCalledTimes(2);
    expect(onResolved).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).not.toContain("server-version-changed");
    expect(document.body.textContent).not.toContain(CANARY);
  });

  it.each([
    "offline",
    "sync-temporarily-unavailable",
  ] as const)("shows neutral pending feedback for %s", async (reason) => {
    engineMocks.listConflicts.mockResolvedValueOnce([conflict()]).mockResolvedValueOnce([]);
    engineMocks.resolveConflict.mockResolvedValue({
      status: "resolved-local-sync-pending",
      reason,
    });
    const onResolved = vi.fn();
    renderSection(onResolved);

    await confirmLocal();

    const pending = await screen.findByText(PENDING_COPY);
    expect(pending.className).not.toContain("sync-conflict-live");
    expect(screen.queryByText(CONFIRMED_COPY)).toBeNull();
    expect(document.body.textContent).not.toContain(reason);
    expect(engineMocks.resolveConflict).toHaveBeenCalledTimes(1);
    expect(onResolved).toHaveBeenCalledTimes(1);
  });

  it("uses green success only for confirmed resolved-local", async () => {
    engineMocks.listConflicts.mockResolvedValueOnce([conflict()]).mockResolvedValueOnce([]);
    engineMocks.resolveConflict.mockResolvedValue({ status: "resolved-local" });
    renderSection();

    await confirmLocal();

    const confirmed = await screen.findByText(CONFIRMED_COPY);
    expect(confirmed.className).toContain("sync-conflict-live");
    expect(screen.queryByText(PENDING_COPY)).toBeNull();
    expect(screen.queryByText(REPLACEMENT_COPY)).toBeNull();
  });

  it.each([
    [{ status: "needs-network-verification", reason: "remote-verification-unavailable" }, "Chưa thể xác minh trạng thái server. Dữ liệu chưa bị thay đổi."],
    [{ status: "failed", reason: "atomic-resolution-failed" }, "Không thể áp dụng lựa chọn. Dữ liệu được giữ nguyên."],
  ] as const)("maps %s to fixed safe copy and refreshes blockers", async (result, expectedCopy) => {
    engineMocks.listConflicts.mockResolvedValue([conflict()]);
    engineMocks.resolveConflict.mockResolvedValue(result);
    const onResolved = vi.fn();
    renderSection(onResolved);

    await confirmLocal();

    expect(await screen.findByText(expectedCopy)).toBeTruthy();
    expect(onResolved).toHaveBeenCalledTimes(1);
    expect(engineMocks.listConflicts).toHaveBeenCalledTimes(2);
    expect(document.body.textContent).not.toContain(result.reason);
    expect(document.body.textContent).not.toContain(CANARY);
  });

  it("never renders a raw thrown error or retries resolution", async () => {
    engineMocks.listConflicts.mockResolvedValue([conflict()]);
    engineMocks.resolveConflict.mockRejectedValue(new Error(`private ${CANARY}`));
    const onResolved = vi.fn();
    renderSection(onResolved);

    await confirmLocal();

    expect(
      await screen.findByText("Không thể xử lý xung đột. Dữ liệu vẫn được giữ nguyên."),
    ).toBeTruthy();
    expect(engineMocks.resolveConflict).toHaveBeenCalledTimes(1);
    expect(onResolved).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).not.toContain(CANARY);
  });
});

describe("explicit choices and confidentiality", () => {
  it("renders only allow-listed metadata and never auto resolves", async () => {
    renderSection(vi.fn(), "focus-once");

    expect(await screen.findByRole("heading", { name: "1 xung đột cần xử lý" })).toBeTruthy();
    await waitFor(() => expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledTimes(1));
    expect(document.body.textContent).not.toContain(CANARY);
    expect(engineMocks.resolveConflict).not.toHaveBeenCalled();
  });

  it("guards double confirmation while a resolution is in flight", async () => {
    let settle: ((result: ResolveConflictResult) => void) | undefined;
    const pendingResult = new Promise<ResolveConflictResult>((resolve) => {
      settle = resolve;
    });
    engineMocks.listConflicts.mockResolvedValueOnce([conflict()]).mockResolvedValueOnce([]);
    engineMocks.resolveConflict.mockReturnValue(pendingResult);
    renderSection();

    fireEvent.click(await screen.findByRole("button", { name: "Giữ dữ liệu trên thiết bị này" }));
    const confirmButton = within(await screen.findByRole("dialog")).getByRole("button", {
      name: /Xác nhận giữ dữ liệu trên thiết bị này/,
    });
    fireEvent.click(confirmButton);
    fireEvent.click(confirmButton);

    await waitFor(() => expect(engineMocks.resolveConflict).toHaveBeenCalledTimes(1));
    settle?.({ status: "resolved-local" });
    expect(await screen.findByText(CONFIRMED_COPY)).toBeTruthy();
  });
});


describe("German locale", () => {
  it("renders conflict labels and actions entirely in German", async () => {
    window.localStorage.setItem(LOCALE_KEY, "de");
    render(
      createElement(
        LocaleProvider,
        null,
        createElement(SyncConflictSection, { userId: "owner-1", onResolved: vi.fn() }),
      ),
    );

    expect(await screen.findByRole("heading", { name: "1 Datenkonflikt erfordert eine Entscheidung" })).toBeTruthy();
    expect(screen.getByRole("article", { name: "Datenkonflikt Einstellungen" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Daten auf diesem Gerät behalten" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Synchronisierte Daten verwenden" })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Đồng bộ|xung đột|Thiết bị|Dùng dữ liệu/);
  });
});

describe("healthy sync state", () => {
  it("keeps a visible clean state and exposes an explicit resync action", async () => {
    engineMocks.listConflicts.mockResolvedValue([]);
    const onSyncNow = vi.fn().mockResolvedValue(undefined);
    render(
      createElement(SyncConflictSection, {
        userId: "owner-1",
        onResolved: vi.fn(),
        onSyncNow,
      }),
    );

    expect(await screen.findByRole("heading", { name: "Không có xung đột dữ liệu đang mở" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Đồng bộ ngay" }));
    await waitFor(() => expect(onSyncNow).toHaveBeenCalledTimes(1));
    expect(engineMocks.resolveConflict).not.toHaveBeenCalled();
  });
});
