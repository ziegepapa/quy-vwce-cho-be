/**
 * Unit tests for scripts/price/history.mjs
 * PRICE-HISTORY-PERSIST-001 r1
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  readHistoryFile,
  normalizePoints,
  upsertHistoryPoint,
  bulkUpsertHistoryPoints,
  HISTORY_SCHEMA_VERSION,
} from "./price/history.mjs";

let tmpDir;
let tmpFile;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "price-history-test-"));
  tmpFile = path.join(tmpDir, "IE00BK5BQT80.json");
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── readHistoryFile ──────────────────────────────────────────────────────────

describe("readHistoryFile", () => {
  it("returns an empty skeleton when the file is missing", () => {
    const result = readHistoryFile(tmpFile, "IE00BK5BQT80", "EUR");
    expect(result).toEqual({
      schemaVersion: HISTORY_SCHEMA_VERSION,
      isin: "IE00BK5BQT80",
      currency: "EUR",
      points: [],
    });
  });

  it("reads an existing file and returns its content", () => {
    const doc = {
      schemaVersion: 1,
      isin: "IE00BK5BQT80",
      currency: "EUR",
      points: [{ date: "2026-08-07", price: 168.38, source: "cron" }],
    };
    fs.writeFileSync(tmpFile, JSON.stringify(doc), "utf8");
    const result = readHistoryFile(tmpFile, "IE00BK5BQT80", "EUR");
    expect(result.points).toHaveLength(1);
    expect(result.points[0].date).toBe("2026-08-07");
    expect(result.points[0].price).toBe(168.38);
  });

  it("throws on malformed JSON (fail closed)", () => {
    fs.writeFileSync(tmpFile, "{bad json", "utf8");
    expect(() => readHistoryFile(tmpFile, "IE00BK5BQT80", "EUR")).toThrow("Malformed");
  });

  it("throws when points array is missing", () => {
    fs.writeFileSync(
      tmpFile,
      JSON.stringify({ schemaVersion: 1, isin: "IE00BK5BQT80", currency: "EUR" }),
      "utf8",
    );
    expect(() => readHistoryFile(tmpFile, "IE00BK5BQT80", "EUR")).toThrow("points array");
  });
});

// ── normalizePoints ──────────────────────────────────────────────────────────

describe("normalizePoints", () => {
  it("sorts by date ascending", () => {
    const pts = [
      { date: "2026-08-09", price: 170, source: "cron" },
      { date: "2026-08-07", price: 168, source: "cron" },
      { date: "2026-08-08", price: 169, source: "cron" },
    ];
    const result = normalizePoints(pts);
    expect(result.map((p) => p.date)).toEqual(["2026-08-07", "2026-08-08", "2026-08-09"]);
  });

  it("deduplicates by date: last entry wins", () => {
    const pts = [
      { date: "2026-08-07", price: 167.0, source: "backfill" },
      { date: "2026-08-07", price: 168.38, source: "cron" },
    ];
    const result = normalizePoints(pts);
    expect(result).toHaveLength(1);
    // Last write (cron) overwrites first (backfill)
    expect(result[0].price).toBe(168.38);
    expect(result[0].source).toBe("cron");
  });

  it("silently drops points with an invalid date string", () => {
    const pts = [
      { date: "not-a-date", price: 168, source: "cron" },
      { date: "2026-99-99", price: 168, source: "cron" },
      { date: "2026-08-07", price: 168, source: "cron" },
    ];
    expect(normalizePoints(pts)).toHaveLength(1);
  });

  it("silently drops points with zero or negative price", () => {
    const pts = [
      { date: "2026-08-05", price: 0, source: "cron" },
      { date: "2026-08-06", price: -5, source: "cron" },
      { date: "2026-08-07", price: 168, source: "cron" },
    ];
    expect(normalizePoints(pts)).toHaveLength(1);
    expect(normalizePoints(pts)[0].date).toBe("2026-08-07");
  });

  it("silently drops points with missing source", () => {
    const pts = [
      { date: "2026-08-07", price: 168, source: "" },
      { date: "2026-08-08", price: 169, source: "cron" },
    ];
    expect(normalizePoints(pts)).toHaveLength(1);
  });
});

// ── upsertHistoryPoint ───────────────────────────────────────────────────────

describe("upsertHistoryPoint", () => {
  it("creates a new file with one point when the file is missing", () => {
    upsertHistoryPoint(tmpFile, "IE00BK5BQT80", "EUR", "2026-08-07", 168.38, "cron");
    const doc = JSON.parse(fs.readFileSync(tmpFile, "utf8"));
    expect(doc.schemaVersion).toBe(HISTORY_SCHEMA_VERSION);
    expect(doc.isin).toBe("IE00BK5BQT80");
    expect(doc.currency).toBe("EUR");
    expect(doc.points).toHaveLength(1);
    expect(doc.points[0]).toEqual({ date: "2026-08-07", price: 168.38, source: "cron" });
  });

  it("appends a new date point to an existing file", () => {
    upsertHistoryPoint(tmpFile, "IE00BK5BQT80", "EUR", "2026-08-07", 168.38, "cron");
    upsertHistoryPoint(tmpFile, "IE00BK5BQT80", "EUR", "2026-08-08", 170.0, "cron");
    const doc = JSON.parse(fs.readFileSync(tmpFile, "utf8"));
    expect(doc.points).toHaveLength(2);
    expect(doc.points[0].date).toBe("2026-08-07");
    expect(doc.points[1].date).toBe("2026-08-08");
  });

  it("overwrites same date (dedup rule: last write wins)", () => {
    // Morning catch-up cron writes first
    upsertHistoryPoint(tmpFile, "IE00BK5BQT80", "EUR", "2026-08-07", 167.0, "cron");
    // Evening cron overwrites with final settlement price
    upsertHistoryPoint(tmpFile, "IE00BK5BQT80", "EUR", "2026-08-07", 168.38, "cron");
    const doc = JSON.parse(fs.readFileSync(tmpFile, "utf8"));
    expect(doc.points).toHaveLength(1);
    expect(doc.points[0].price).toBe(168.38);
  });

  it("creates parent directories if they do not exist", () => {
    const deepPath = path.join(tmpDir, "sub", "dir", "ISIN.json");
    upsertHistoryPoint(deepPath, "IE00BK5BQT80", "EUR", "2026-08-07", 168.38, "cron");
    expect(fs.existsSync(deepPath)).toBe(true);
  });

  it("throws on invalid ISIN", () => {
    expect(() =>
      upsertHistoryPoint(tmpFile, "NOTANISIN000", "EUR", "2026-08-07", 168, "cron"),
    ).toThrow();
  });

  it("throws on invalid date", () => {
    expect(() =>
      upsertHistoryPoint(tmpFile, "IE00BK5BQT80", "EUR", "not-a-date", 168, "cron"),
    ).toThrow("Invalid date");
  });

  it("throws on invalid price (zero)", () => {
    expect(() =>
      upsertHistoryPoint(tmpFile, "IE00BK5BQT80", "EUR", "2026-08-07", 0, "cron"),
    ).toThrow("Invalid price");
  });

  it("throws on invalid price (negative)", () => {
    expect(() =>
      upsertHistoryPoint(tmpFile, "IE00BK5BQT80", "EUR", "2026-08-07", -1, "cron"),
    ).toThrow("Invalid price");
  });

  it("throws on empty source string", () => {
    expect(() =>
      upsertHistoryPoint(tmpFile, "IE00BK5BQT80", "EUR", "2026-08-07", 168, ""),
    ).toThrow("Invalid source");
  });
});

// ── bulkUpsertHistoryPoints ──────────────────────────────────────────────────

describe("bulkUpsertHistoryPoints", () => {
  it("writes many points at once into a new file", () => {
    const pts = [
      { date: "2026-08-05", price: 166, source: "backfill" },
      { date: "2026-08-06", price: 167, source: "backfill" },
      { date: "2026-08-07", price: 168, source: "backfill" },
    ];
    bulkUpsertHistoryPoints(tmpFile, "IE00BK5BQT80", "EUR", pts);
    const doc = JSON.parse(fs.readFileSync(tmpFile, "utf8"));
    expect(doc.points).toHaveLength(3);
    expect(doc.points[0].date).toBe("2026-08-05");
  });

  it("merges with existing points, bulk wins on overlap", () => {
    upsertHistoryPoint(tmpFile, "IE00BK5BQT80", "EUR", "2026-08-07", 167.0, "cron");
    const pts = [
      { date: "2026-08-06", price: 166.0, source: "backfill" },
      { date: "2026-08-07", price: 168.38, source: "backfill" }, // overlaps cron
    ];
    bulkUpsertHistoryPoints(tmpFile, "IE00BK5BQT80", "EUR", pts);
    const doc = JSON.parse(fs.readFileSync(tmpFile, "utf8"));
    expect(doc.points).toHaveLength(2);
    // Bulk points come after existing in merge array -> backfill overwrites cron
    const aug7 = doc.points.find((p) => p.date === "2026-08-07");
    expect(aug7?.price).toBe(168.38);
    expect(aug7?.source).toBe("backfill");
  });

  it("silently drops invalid points within the bulk array", () => {
    const pts = [
      { date: "invalid", price: 166, source: "backfill" },
      { date: "2026-08-07", price: 0, source: "backfill" },
      { date: "2026-08-08", price: 168, source: "backfill" }, // only valid one
    ];
    bulkUpsertHistoryPoints(tmpFile, "IE00BK5BQT80", "EUR", pts);
    const doc = JSON.parse(fs.readFileSync(tmpFile, "utf8"));
    expect(doc.points).toHaveLength(1);
    expect(doc.points[0].date).toBe("2026-08-08");
  });

  it("throws on invalid ISIN", () => {
    expect(() =>
      bulkUpsertHistoryPoints(tmpFile, "NOTANISIN000", "EUR", []),
    ).toThrow();
  });
});
