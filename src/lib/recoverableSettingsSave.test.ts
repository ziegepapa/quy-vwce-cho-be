import { beforeEach, describe, expect, it, vi } from "vitest";
import { isRecoverableOperationError } from "./operationErrors";

const saveSettingsBase = vi.hoisted(() => vi.fn());
vi.mock("./db.m07b", () => ({ saveSettings: saveSettingsBase }));

import { saveSettings } from "./recoverableSettingsSave";

beforeEach(() => saveSettingsBase.mockReset());

describe("recoverable settings save", () => {
  it("tags failures without exposing the underlying exception message", async () => {
    saveSettingsBase.mockRejectedValueOnce(new Error("SETTINGS_STORAGE_SECRET_CANARY"));

    let caught: unknown;
    try {
      await saveSettings({ contributionY1: 250 });
    } catch (reason) {
      caught = reason;
    }

    expect(isRecoverableOperationError(caught, "settings-save")).toBe(true);
    expect(caught instanceof Error ? caught.message : "").not.toContain("SETTINGS_STORAGE_SECRET_CANARY");
  });

  it("passes successful writes through unchanged", async () => {
    saveSettingsBase.mockResolvedValueOnce(undefined);

    await saveSettings({ contributionY1: 250 }, { sync: false });

    expect(saveSettingsBase).toHaveBeenCalledWith({ contributionY1: 250 }, { sync: false });
  });
});
