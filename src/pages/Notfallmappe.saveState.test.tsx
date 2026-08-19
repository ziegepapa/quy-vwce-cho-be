// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { defaultNotfallmappe } from "../lib/defaults";
import type { AppSettings } from "../lib/types";

const dbMocks = vi.hoisted(() => ({
  getSettings: vi.fn(),
  listGoals: vi.fn(),
  listTransactions: vi.fn(),
  saveSettings: vi.fn(),
}));
const printMock = vi.hoisted(() => vi.fn());

vi.mock("../lib/db", () => dbMocks);
vi.mock("../lib/recoveryReadOnly", () => ({
  useRecoveryReadOnly: () => ({ readOnly: false, showBlocked: vi.fn() }),
}));
vi.mock("../lib/printNotfallmappe", () => ({ printNotfallmappe: printMock }));

import NotfallmappePage from "./Notfallmappe";

function settings(): AppSettings {
  return {
    childName: "Bé",
    latestVwcePrice: 0,
    notfallmappe: defaultNotfallmappe(),
  } as unknown as AppSettings;
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

async function renderLoaded() {
  render(createElement(NotfallmappePage));
  await screen.findByText(/Không bao giờ ghi mật khẩu/);
  return screen.getByLabelText("Số tiền này dành cho ai và để làm gì") as HTMLTextAreaElement;
}

beforeEach(() => {
  // resetAllMocks also clears queued mockResolvedValueOnce/mockRejectedValueOnce
  // left by a prior test. clearAllMocks only clears calls and is insufficient here.
  vi.resetAllMocks();
  dbMocks.getSettings.mockResolvedValue(settings());
  dbMocks.listGoals.mockResolvedValue([]);
  dbMocks.listTransactions.mockResolvedValue([]);
  dbMocks.saveSettings.mockResolvedValue(undefined);
});

afterEach(async () => {
  // Let React settle state updates before the next test reconfigures shared mocks.
  await Promise.resolve();
  cleanup();
  vi.useRealTimers();
});

describe("Notfallmappe save state", () => {
  it("keeps the local draft visible and retries a failed save", async () => {
    dbMocks.saveSettings
      .mockRejectedValueOnce(new Error("NOTFALLMAPPE_SECRET_CANARY"))
      .mockResolvedValueOnce(undefined);
    const purpose = await renderLoaded();

    fireEvent.change(purpose, { target: { value: "Bản nháp vẫn ở trên màn hình" } });

    await waitFor(() => expect(dbMocks.saveSettings).toHaveBeenCalledTimes(1));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Không lưu được Hồ sơ khẩn cấp");
    expect(screen.queryByText("NOTFALLMAPPE_SECRET_CANARY")).toBeNull();
    expect(purpose.value).toBe("Bản nháp vẫn ở trên màn hình");

    fireEvent.click(screen.getByRole("button", { name: "Thử lưu lại" }));

    await waitFor(() => expect(dbMocks.saveSettings).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(purpose.value).toBe("Bản nháp vẫn ở trên màn hình");
  });

  it("serializes rapid edits so an older write cannot finish last", async () => {
    const first = deferred<void>();
    const second = deferred<void>();
    dbMocks.saveSettings
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const purpose = await renderLoaded();

    fireEvent.change(purpose, { target: { value: "A" } });
    fireEvent.change(purpose, { target: { value: "AB" } });

    await waitFor(() => expect(dbMocks.saveSettings).toHaveBeenCalledTimes(1));
    expect(dbMocks.saveSettings.mock.calls[0][0].notfallmappe.purpose).toBe("A");

    first.resolve(undefined);
    await waitFor(() => expect(dbMocks.saveSettings).toHaveBeenCalledTimes(2));
    expect(dbMocks.saveSettings.mock.calls[1][0].notfallmappe.purpose).toBe("AB");

    second.resolve(undefined);
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Đã lưu"));
  });

  it("does not print when saving the print timestamp fails", async () => {
    dbMocks.saveSettings.mockRejectedValueOnce(new Error("write failed"));
    await renderLoaded();

    fireEvent.click(screen.getByRole("button", { name: "In / Lưu PDF" }));

    await waitFor(() => expect(dbMocks.saveSettings).toHaveBeenCalledTimes(1));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Không lưu được Hồ sơ khẩn cấp");
    expect(printMock).not.toHaveBeenCalled();
  });
});
