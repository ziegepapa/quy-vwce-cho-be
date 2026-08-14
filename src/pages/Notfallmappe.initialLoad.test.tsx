// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { defaultNotfallmappe } from "../lib/defaults";
import type { AppSettings } from "../lib/types";

const dbMocks = vi.hoisted(() => ({
  getSettings: vi.fn(),
  listGoals: vi.fn(),
  listTransactions: vi.fn(),
  saveSettings: vi.fn(),
}));

vi.mock("../lib/db", () => dbMocks);
vi.mock("../lib/recoveryReadOnly", () => ({
  useRecoveryReadOnly: () => ({ readOnly: false, showBlocked: vi.fn() }),
}));
vi.mock("../lib/printNotfallmappe", () => ({ printNotfallmappe: vi.fn() }));

import NotfallmappePage from "./Notfallmappe";

function loadedSettings(): AppSettings {
  return {
    childName: "Bé",
    latestVwcePrice: 0,
    notfallmappe: defaultNotfallmappe(),
  } as unknown as AppSettings;
}

beforeEach(() => {
  vi.clearAllMocks();
  dbMocks.listGoals.mockResolvedValue([]);
  dbMocks.listTransactions.mockResolvedValue([]);
  dbMocks.saveSettings.mockResolvedValue(undefined);
});

afterEach(() => cleanup());

describe("Notfallmappe initial load state", () => {
  it("announces loading without rendering any emergency-profile content", () => {
    dbMocks.getSettings.mockReturnValue(new Promise(() => undefined));

    render(createElement(NotfallmappePage));

    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-busy")).toBe("true");
    expect(screen.getByText("Đang tải Hồ sơ khẩn cấp…")).toBeTruthy();
    expect(screen.queryByText(/Không bao giờ ghi mật khẩu/)).toBeNull();
  });

  it("fails closed without exposing the error and retries the complete snapshot", async () => {
    dbMocks.getSettings
      .mockRejectedValueOnce(new Error("NOTFALLMAPPE_SECRET_CANARY"))
      .mockResolvedValueOnce(loadedSettings());

    render(createElement(NotfallmappePage));

    expect(
      await screen.findByRole("heading", { name: "Không tải được Hồ sơ khẩn cấp" }),
    ).toBeTruthy();
    expect(screen.queryByText("NOTFALLMAPPE_SECRET_CANARY")).toBeNull();
    expect(screen.queryByText(/Không bao giờ ghi mật khẩu/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));

    expect(await screen.findByText(/Không bao giờ ghi mật khẩu/)).toBeTruthy();
    expect(dbMocks.getSettings).toHaveBeenCalledTimes(2);
    expect(dbMocks.listGoals).toHaveBeenCalledTimes(2);
    expect(dbMocks.listTransactions).toHaveBeenCalledTimes(2);
  });
});
