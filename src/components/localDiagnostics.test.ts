import { describe, expect, it } from "vitest";
import {
  LOCAL_DIAGNOSTICS_LIMIT,
  LOCAL_DIAGNOSTICS_STORAGE_KEY,
  clearLocalDiagnostics,
  getLocalDiagnostics,
  recordLocalDiagnostic,
} from "./localDiagnostics";

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

describe("local diagnostics", () => {
  it("stores only approved metadata and never error payloads", () => {
    const local = storage();
    const now = () => new Date("2026-08-20T12:00:00.000Z");

    recordLocalDiagnostic({ category: "app-failure", code: "render-error" }, local, now);
    const events = getLocalDiagnostics(local);

    expect(events).toEqual([{
      at: "2026-08-20T12:00:00.000Z",
      category: "app-failure",
      code: "render-error",
    }]);
    expect(local.getItem(LOCAL_DIAGNOSTICS_STORAGE_KEY)).not.toContain("Error");
  });

  it("filters untrusted stored fields and retains only valid safe events", () => {
    const local = storage();
    local.setItem(LOCAL_DIAGNOSTICS_STORAGE_KEY, JSON.stringify([
      { at: "2026-08-20T12:00:00.000Z", category: "sync-health", code: "offline", message: "secret text" },
      { at: "invalid", category: "sync-health", code: "offline" },
      { at: "2026-08-20T12:01:00.000Z", category: "unknown", code: "offline" },
    ]));

    expect(getLocalDiagnostics(local)).toEqual([{
      at: "2026-08-20T12:00:00.000Z",
      category: "sync-health",
      code: "offline",
    }]);
  });

  it("deduplicates adjacent state signals and keeps a bounded local journal", () => {
    const local = storage();
    const now = () => new Date("2026-08-20T12:00:00.000Z");

    recordLocalDiagnostic({ category: "sync-health", code: "synced" }, local, now);
    recordLocalDiagnostic({ category: "sync-health", code: "synced" }, local, now);
    for (let index = 0; index < LOCAL_DIAGNOSTICS_LIMIT + 3; index += 1) {
      recordLocalDiagnostic({ category: "sync-health", code: index % 2 === 0 ? "pending" : "syncing" }, local, now);
    }

    expect(getLocalDiagnostics(local)).toHaveLength(LOCAL_DIAGNOSTICS_LIMIT);
    clearLocalDiagnostics(local);
    expect(getLocalDiagnostics(local)).toEqual([]);
  });
});
