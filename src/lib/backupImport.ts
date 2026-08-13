import type { BackupPayload } from "./types";
import { validateBackupPayload } from "./backupSchema";
import { importBackup as importBackupUnchecked } from "./db.m09";

/**
 * Public fail-closed import entry point.
 * Rejects malformed files before db.m09 starts its clear-and-restore transaction.
 */
export async function importBackup(payload: BackupPayload): Promise<void> {
  const validation = validateBackupPayload(payload);
  if (!validation.ok) throw new Error(validation.error);
  await importBackupUnchecked(validation.payload);
}
