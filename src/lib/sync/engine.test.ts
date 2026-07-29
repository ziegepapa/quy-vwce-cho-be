import { describe, expect, it } from "vitest";
import { computeSyncStatus } from "./engine";

describe("computeSyncStatus", () => {
  it("offline wins", () => {
    expect(
      computeSyncStatus({ online: false, syncing: true, conflictCount: 0, pendingOutbox: 0 }),
    ).toBe("offline");
  });
  it("conflict", () => {
    expect(
      computeSyncStatus({ online: true, syncing: false, conflictCount: 1, pendingOutbox: 0 }),
    ).toBe("conflict");
  });
  it("syncing via outbox", () => {
    expect(
      computeSyncStatus({ online: true, syncing: false, conflictCount: 0, pendingOutbox: 3 }),
    ).toBe("syncing");
  });
  it("synced", () => {
    expect(
      computeSyncStatus({ online: true, syncing: false, conflictCount: 0, pendingOutbox: 0 }),
    ).toBe("synced");
  });
});
