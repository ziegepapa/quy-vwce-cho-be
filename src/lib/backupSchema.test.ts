import { describe, expect, it } from "vitest";
import { isSupportedBackupSchema } from "./backupSchema";
import { BACKUP_SCHEMA_VERSION } from "./types";

describe("isSupportedBackupSchema", () => {
  it("accepts 1, 2 and BACKUP_SCHEMA_VERSION (3)", () => {
    expect(isSupportedBackupSchema(1)).toBe(true);
    expect(isSupportedBackupSchema(2)).toBe(true);
    expect(isSupportedBackupSchema(BACKUP_SCHEMA_VERSION)).toBe(true);
    expect(isSupportedBackupSchema(3)).toBe(true);
  });

  it("rejects other values", () => {
    expect(isSupportedBackupSchema(0)).toBe(false);
    expect(isSupportedBackupSchema(4)).toBe(false);
    expect(isSupportedBackupSchema(undefined)).toBe(false);
    expect(isSupportedBackupSchema("1")).toBe(false);
    expect(isSupportedBackupSchema(1.5)).toBe(false);
    expect(isSupportedBackupSchema(null)).toBe(false);
  });
});
