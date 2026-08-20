import { describe, expect, it } from "vitest";
import { buildSyncHealth, syncHealthCopy } from "./syncHealth";

const clean = {
  signedIn: true,
  online: true,
  running: false,
  pending: 0,
  dead: 0,
  conflicts: 0,
  recoveryPending: false,
};

describe("Sync Health", () => {
  it("prioritizes recovery, conflict, and retry over a nominally online state", () => {
    expect(buildSyncHealth({ ...clean, recoveryPending: true, conflicts: 2, dead: 1 }).state).toBe("recovery");
    expect(buildSyncHealth({ ...clean, conflicts: 2, dead: 1 }).state).toBe("conflict");
    expect(buildSyncHealth({ ...clean, dead: 1, pending: 4 }).state).toBe("retry");
  });

  it("distinguishes running synchronization from a queued change", () => {
    expect(buildSyncHealth({ ...clean, running: true, pending: 3 }).state).toBe("syncing");
    expect(buildSyncHealth({ ...clean, pending: 3 }).state).toBe("pending");
  });

  it("keeps signed-out and offline states informative without promising synchronization", () => {
    expect(buildSyncHealth({ ...clean, signedIn: false }).state).toBe("signed-out");
    expect(buildSyncHealth({ ...clean, online: false, pending: 2 }).state).toBe("offline");
  });

  it("uses fully localized German conflict and queued-change copy", () => {
    const conflict = syncHealthCopy(buildSyncHealth({ ...clean, conflicts: 2 }), "de");
    const pending = syncHealthCopy(buildSyncHealth({ ...clean, pending: 1 }), "de");
    expect(conflict.title).toBe("2 Datenkonflikte");
    expect(conflict.detail).not.toContain("Không");
    expect(conflict.detail).not.toContain("xung đột");
    expect(conflict.nextStep).toContain("trifft keine Auswahl");
    expect(pending.actionLabel).toBe("Jetzt synchronisieren");
  });

  it("explains retry safety in Vietnamese without promising an automatic conflict decision", () => {
    const retry = syncHealthCopy(buildSyncHealth({ ...clean, dead: 2, pending: 2 }), "vi");

    expect(retry.actionLabel).toBe("Đồng bộ lại");
    expect(retry.nextStep).toContain("không tự chọn");
    expect(retry.nextStep).toContain("không tự ghi đè");
  });
});
