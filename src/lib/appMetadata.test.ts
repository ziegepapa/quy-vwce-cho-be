import { describe, expect, it } from "vitest";
import type { AppMetadata, QuoteMigrationMeta } from "./types";
import {
  APP_META_ID,
  QUOTE_MIGRATION_META_ID,
  isAppMetadata,
  isQuoteMigrationMeta,
  isQuoteMigrationState,
} from "./appMetadata";

const META_ROW: AppMetadata = {
  id: APP_META_ID,
  schemaVersion: 3,
  lastBackupAt: "2026-08-07T16:00:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-08-07T16:00:00.000Z",
};

const MIGRATION_ROW: QuoteMigrationMeta = {
  id: QUOTE_MIGRATION_META_ID,
  state: "complete",
  updatedAt: "2026-08-07T16:00:00.000Z",
};

describe("isQuoteMigrationState", () => {
  it("accepts the three states the migration can really be in", () => {
    expect(isQuoteMigrationState("pending")).toBe(true);
    expect(isQuoteMigrationState("complete")).toBe(true);
    expect(isQuoteMigrationState("failed")).toBe(true);
  });

  it("rejects anything else, including a plausible synonym", () => {
    expect(isQuoteMigrationState("done")).toBe(false);
    expect(isQuoteMigrationState("COMPLETE")).toBe(false);
    expect(isQuoteMigrationState("")).toBe(false);
    expect(isQuoteMigrationState(1)).toBe(false);
    expect(isQuoteMigrationState(undefined)).toBe(false);
  });
});

describe("isQuoteMigrationMeta", () => {
  it("accepts a well formed row in each state", () => {
    expect(isQuoteMigrationMeta({ ...MIGRATION_ROW, state: "pending" })).toBe(true);
    expect(isQuoteMigrationMeta({ ...MIGRATION_ROW, state: "complete" })).toBe(true);
    expect(isQuoteMigrationMeta({ ...MIGRATION_ROW, state: "failed" })).toBe(true);
  });

  it("accepts a failed row that carries the error text", () => {
    expect(
      isQuoteMigrationMeta({
        ...MIGRATION_ROW,
        state: "failed",
        lastError: "Migration: invalid price on quote q1",
      }),
    ).toBe(true);
  });

  it("rejects the bookkeeping row that lives in the same store", () => {
    expect(isQuoteMigrationMeta(META_ROW)).toBe(false);
  });

  it("rejects an absent row", () => {
    expect(isQuoteMigrationMeta(undefined)).toBe(false);
    expect(isQuoteMigrationMeta(null)).toBe(false);
  });

  it("rejects a state outside the three known ones", () => {
    expect(isQuoteMigrationMeta({ ...MIGRATION_ROW, state: "done" })).toBe(false);
  });

  it("rejects a row stored under another id", () => {
    expect(isQuoteMigrationMeta({ ...MIGRATION_ROW, id: APP_META_ID })).toBe(false);
  });

  it("rejects a row without a usable updatedAt", () => {
    expect(isQuoteMigrationMeta({ id: QUOTE_MIGRATION_META_ID, state: "complete" })).toBe(false);
    expect(isQuoteMigrationMeta({ ...MIGRATION_ROW, updatedAt: "" })).toBe(false);
  });

  it("rejects a row whose lastError is not text", () => {
    expect(isQuoteMigrationMeta({ ...MIGRATION_ROW, lastError: 500 })).toBe(false);
  });
});

describe("isAppMetadata", () => {
  it("accepts the bookkeeping row", () => {
    expect(isAppMetadata(META_ROW)).toBe(true);
  });

  it("rejects the migration row", () => {
    expect(isAppMetadata(MIGRATION_ROW)).toBe(false);
  });

  it("rejects a row whose schemaVersion is text or missing", () => {
    expect(isAppMetadata({ ...META_ROW, schemaVersion: "3" })).toBe(false);
    expect(isAppMetadata({
      id: APP_META_ID,
      lastBackupAt: "",
      createdAt: "",
      updatedAt: "",
    })).toBe(false);
  });

  it("rejects an absent row", () => {
    expect(isAppMetadata(undefined)).toBe(false);
    expect(isAppMetadata("meta")).toBe(false);
  });
});

describe("the two row shapes cannot be confused", () => {
  it("no row satisfies both guards", () => {
    for (const row of [META_ROW, MIGRATION_ROW]) {
      expect(isAppMetadata(row) && isQuoteMigrationMeta(row)).toBe(false);
    }
  });
});
