import type { AppSettings } from "./types";
import { saveSettings as saveSettingsBase } from "./db.m07b";
import { RecoverableOperationError, isRecoverableOperationError } from "./operationErrors";

/** Public settings writer with a stable, non-sensitive operation error tag. */
export async function saveSettings(
  partial: Partial<AppSettings>,
  opts?: { sync?: boolean },
): Promise<void> {
  try {
    await saveSettingsBase(partial, opts);
  } catch (reason) {
    if (isRecoverableOperationError(reason)) throw reason;
    throw new RecoverableOperationError("settings-save", reason);
  }
}
