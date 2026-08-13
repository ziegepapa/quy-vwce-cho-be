import { describe, expect, it } from "vitest";
import {
  isSupportedBackupSchema,
  validateBackupPayload,
} from "./backupSchema";
import { BACKUP_SCHEMA_VERSION } from "./types";
import type { BackupPayload } from "./types";

const VALID: BackupPayload = {
  schemaVersion: BACKUP_SCHEMA_VERSION,
  exportedAt: "2026-08-13T12:00:00.000Z",
  settings: [],
  goals: [],
  transactions: [],
  annualChecklists: [],
  monthlySnapshots: [],
};

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

describe("validateBackupPayload", () => {
  it("accepts a complete base payload", () => {
    const result = validateBackupPayload(VALID);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.payload).toEqual(VALID);
  });

  it("rejects non-object and array roots", () => {
    expect(validateBackupPayload(null)).toEqual({
      ok: false,
      error: "Cấu trúc backup không hợp lệ",
    });
    expect(validateBackupPayload([])).toEqual({
      ok: false,
      error: "Cấu trúc backup không hợp lệ",
    });
  });

  it("rejects unsupported schema versions with an explicit message", () => {
    const result = validateBackupPayload({ ...VALID, schemaVersion: 999 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("hỗ trợ: 1, 2 hoặc 3");
  });

  it("rejects a supported-schema payload missing required arrays", () => {
    const { transactions: _transactions, ...missingTransactions } = VALID;
    const result = validateBackupPayload(missingTransactions);
    expect(result).toEqual({
      ok: false,
      error: "Backup thiếu hoặc sai trường bắt buộc: transactions",
    });
  });

  it("rejects invalid exportedAt and malformed optional arrays", () => {
    expect(validateBackupPayload({ ...VALID, exportedAt: "not-a-date" })).toEqual({
      ok: false,
      error: "Backup thiếu hoặc sai trường bắt buộc: exportedAt",
    });
    expect(validateBackupPayload({ ...VALID, quoteCandidates: {} })).toEqual({
      ok: false,
      error: "Backup có trường không hợp lệ: quoteCandidates",
    });
  });
});
