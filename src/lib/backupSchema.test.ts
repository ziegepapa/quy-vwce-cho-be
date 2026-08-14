import { describe, expect, it } from "vitest";
import {
  isSupportedBackupSchema,
  unsupportedBackupSchemaMessage,
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
  it("accepts 1, 2, 3 and BACKUP_SCHEMA_VERSION (4)", () => {
    expect(isSupportedBackupSchema(1)).toBe(true);
    expect(isSupportedBackupSchema(2)).toBe(true);
    expect(isSupportedBackupSchema(3)).toBe(true);
    expect(isSupportedBackupSchema(BACKUP_SCHEMA_VERSION)).toBe(true);
    expect(isSupportedBackupSchema(4)).toBe(true);
  });

  it("rejects other values", () => {
    expect(isSupportedBackupSchema(0)).toBe(false);
    expect(isSupportedBackupSchema(5)).toBe(false);
    expect(isSupportedBackupSchema(undefined)).toBe(false);
    expect(isSupportedBackupSchema("1")).toBe(false);
    expect(isSupportedBackupSchema(1.5)).toBe(false);
    expect(isSupportedBackupSchema(null)).toBe(false);
  });
});

describe("unsupportedBackupSchemaMessage", () => {
  it("names every supported backup schema exactly", () => {
    expect(unsupportedBackupSchemaMessage(999)).toBe(
      "schemaVersion kh\u00f4ng kh\u1edbp (file: 999; h\u1ed7 tr\u1ee3: 1, 2, 3 ho\u1eb7c 4)",
    );
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
      error: "C\u1ea5u tr\u00fac backup kh\u00f4ng h\u1ee3p l\u1ec7",
    });
    expect(validateBackupPayload([])).toEqual({
      ok: false,
      error: "C\u1ea5u tr\u00fac backup kh\u00f4ng h\u1ee3p l\u1ec7",
    });
  });

  it("rejects unsupported schema versions with the canonical exact message", () => {
    const result = validateBackupPayload({ ...VALID, schemaVersion: 999 });
    expect(result).toEqual({
      ok: false,
      error: "schemaVersion kh\u00f4ng kh\u1edbp (file: 999; h\u1ed7 tr\u1ee3: 1, 2, 3 ho\u1eb7c 4)",
    });
  });

  it("rejects a supported-schema payload missing required arrays", () => {
    const { transactions: _transactions, ...missingTransactions } = VALID;
    const result = validateBackupPayload(missingTransactions);
    expect(result).toEqual({
      ok: false,
      error: "Backup thi\u1ebfu ho\u1eb7c sai tr\u01b0\u1eddng b\u1eaft bu\u1ed9c: transactions",
    });
  });

  it("rejects invalid exportedAt and malformed optional arrays", () => {
    expect(validateBackupPayload({ ...VALID, exportedAt: "not-a-date" })).toEqual({
      ok: false,
      error: "Backup thi\u1ebfu ho\u1eb7c sai tr\u01b0\u1eddng b\u1eaft bu\u1ed9c: exportedAt",
    });
    expect(validateBackupPayload({ ...VALID, quoteCandidates: {} })).toEqual({
      ok: false,
      error: "Backup c\u00f3 tr\u01b0\u1eddng kh\u00f4ng h\u1ee3p l\u1ec7: quoteCandidates",
    });
  });

  it("rejects deletedGoals entry missing deletedAt", () => {
    const result = validateBackupPayload({
      ...VALID,
      deletedGoals: [{ id: "g1" } as unknown as import("./types").Goal],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/deletedGoals\[0\]/);
  });

  it("rejects deletedTransactions entry missing deletedAt", () => {
    const result = validateBackupPayload({
      ...VALID,
      deletedTransactions: [{ id: "t1" } as unknown as import("./types").Transaction],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/deletedTransactions\[0\]/);
  });
});
