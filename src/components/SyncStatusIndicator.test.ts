// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { SYNC_STATUS_LABEL, type SyncStatus } from "../lib/sync/types";
import { mapSyncStatusLabel } from "./SyncStatusIndicator";

describe("SyncStatus UI labels", () => {
  const all: SyncStatus[] = ["synced", "syncing", "offline", "conflict"];
  it("maps all four statuses", () => {
    for (const s of all) {
      expect(mapSyncStatusLabel(s)).toBe(SYNC_STATUS_LABEL[s]);
      expect(mapSyncStatusLabel(s).length).toBeGreaterThan(0);
    }
  });
  it("keeps Vietnamese labels as the default", () => {
    expect(mapSyncStatusLabel("synced")).toBe("Đã đồng bộ");
    expect(mapSyncStatusLabel("syncing")).toBe("Đang đồng bộ");
    expect(mapSyncStatusLabel("offline")).toBe("Ngoại tuyến");
    expect(mapSyncStatusLabel("conflict")).toBe("Có xung đột");
  });

  it("maps all statuses to German when Deutsch is active", () => {
    expect(mapSyncStatusLabel("synced", "de")).toBe("Synchronisiert");
    expect(mapSyncStatusLabel("syncing", "de")).toBe("Synchronisierung läuft…");
    expect(mapSyncStatusLabel("offline", "de")).toBe("Offline");
    expect(mapSyncStatusLabel("conflict", "de")).toBe("Konflikte prüfen");
  });
});
