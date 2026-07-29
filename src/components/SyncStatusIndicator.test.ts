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
  it("Vietnamese labels", () => {
    expect(mapSyncStatusLabel("synced")).toBe("Đã đồng bộ");
    expect(mapSyncStatusLabel("syncing")).toBe("Đang đồng bộ");
    expect(mapSyncStatusLabel("offline")).toBe("Ngoại tuyến");
    expect(mapSyncStatusLabel("conflict")).toBe("Có xung đột");
  });
});
