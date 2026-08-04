import type { AppSettings } from "./types";
import { SCHEMA_VERSION } from "./types";
import { defaultGoals, defaultSettings, nowIso } from "./defaults";
import { db } from "./db.m01a";
import { ensureMultiAssetMigrated } from "./db.m01b";
import { ensureQuoteFoundationMigrated } from "./db.m02";
export async function ensureInitialized(seedSample: boolean): Promise<void> {
  const existing = await db.settings.get("settings");
  if (existing?.onboardingDone) {
    await ensureMultiAssetMigrated();
    await ensureQuoteFoundationMigrated();
    return;
  }
  const settings = defaultSettings();
  settings.onboardingDone = true;
  settings.disclaimerAccepted = true;
  await db.settings.put(settings);
  await db.appMetadata.put({
    id: "meta",
    schemaVersion: SCHEMA_VERSION,
    lastBackupAt: "",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });
  if (seedSample) {
    await db.goals.clear();
    await db.goals.bulkPut(defaultGoals());
  }
  await ensureMultiAssetMigrated();
  await ensureQuoteFoundationMigrated();
}
