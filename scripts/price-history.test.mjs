/**
 * Unit tests for scripts/price/history.mjs
 * PRICE-HISTORY-PERSIST-001 r1
 * Run: node --test scripts/price-history.test.mjs
 */

import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
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

// ── helpers ──────────────────────────────────────────────────────────────────

function setup() {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "price-history-test-"));
  tmpFile = path.join(tmpDir, "IE00BK5BQT80.json");
}

function teardown() {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

// ── readHistoryFile ──────────────────────────────────────────────────────────

describe("readHistoryFile", () => {
  beforeEach(setup);
  afterEach(teardown);

  it("returns an empty skeleton when the file is missing", () => {
    const result = readHistoryFile(tmpFile, "IE00BK5BQT80", "EUR");
    assert.deepEqual(result, {
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
    assert.equal(result.points.length, 1);
    assert.equal(result.points[0].date, "2026-08-07");
    assert.equal(result.points[0].price, 168.38);
  });

  it("throws on malformed JSON (fail closed)", () => {
    fs.writeFileSync(tmpFile, "{bad json", "utf8");
    assert.throws(
      () => readHistoryFile(tmpFile, "IE00BK5BQT80", "EUR"),
      /Malformed/,
    );
  });

  it("throws when points array is missing", () => {
    fs.writeFileSync(
      tmpFile,
      JSON.stringify({ schemaVersion: 1, isin: "IE00BK5BQT80", currency: "EUR" }),
      "utf8",
    );
    assert.throws(
      () => readHistoryFile(tmpFile, "IE00BK5BQT80", "EUR"),
      /points array/,
    );
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
    assert.deepEqual(
      result.map((p) => p.date),
      ["2026-08-07", "2026-08-08", "2026-08-09"],
    );
  });

  it("deduplicates by date: last entry wins", () => {
    const pts = [
      { date: "2026-08-07", price: 167.0, source: "backfill" },
      { date: "2026-08-07", price: 168.38, source: "cron" },
    ];
    const result = normalizePoints(pts);
    assert.equal(result.length, 1);
    assert.equal(result[0].price, 168.38);
    assert.equal(result[0].source, "cron");
  });

  it("silently drops points with an invalid date string", () => {
    const pts = [
      { date: "not-a-date", price: 168, source: "cron" },
      { date: "2026-99-99", price: 168, source: "cron" },
      { date: "2026-08-07", price: 168, source: "cron" },
    ];
    assert.equal(normalizePoints(pts).length, 1);
  });

  it("silently drops points with zero or negative price", () => {
    const pts = [
      { date: "2026-08-05", price: 0, source: "cron" },
      { date: "2026-08-06", price: -5, source: "cron" },
      { date: "2026-08-07", price: 168, source: "cron" },
    ];
    const result = normalizePoints(pts);
    assert.equal(result.length, 1);
    assert.equal(result[0].date, "2026-08-07");
  });

  it("silently drops points with missing source", () => {
    const pts = [
      { date: "2026-08-07", price: 168, source: "" },
      { date: "2026-08-08", price: 169, source: "cron" },
    ];
    assert.equal(normalizePoints(pts).length, 1);
  });
});

// ── upsertHistoryPoint ───────────────────────────────────────────────────────

describe("upsertHistoryPoint", () => {
  beforeEach(setup);
  afterEach(teardown);

  it("creates a new file with one point when the file is missing", () => {
    upsertHistoryPoint(tmpFile, "IE00BK5BQT80", "EUR", "2026-08-07", 168.38, "cron");
    const doc = JSON.parse(fs.readFileSync(tmpFile, "utf8"));
    assert.equal(doc.schemaVersion, HISTORY_SCHEMA_VERSION);
    assert.equal(doc.isin, "IE00BK5BQT80");
    assert.equal(doc.currency, "EUR");
    assert.equal(doc.points.length, 1);
    assert.deepEqual(doc.points[0], { date: "2026-08-07", price: 168.38, source: "cron" });
  });

  it("appends a new date point to an existing file", () => {
    upsertHistoryPoint(tmpFile, "IE00BK5BQT80", "EUR", "2026-08-07", 168.38, "cron");
    upsertHistoryPoint(tmpFile, "IE00BK5BQT80", "EUR", "2026-08-08", 170.0, "cron");
    const doc = JSON.parse(fs.readFileSync(tmpFile, "utf8"));
    assert.equal(doc.points.length, 2);
    assert.equal(doc.points[0].date, "2026-08-07");
    assert.equal(doc.points[1].date, "2026-08-08");
  });

  it("overwrites same date (dedup rule: last write wins)", () => {
    upsertHistoryPoint(tmpFile, "IE00BK5BQT80", "EUR", "2026-08-07", 167.0, "cron");
    upsertHistoryPoint(tmpFile, "IE00BK5BQT80", "EUR", "2026-08-07", 168.38, "cron");
    const doc = JSON.parse(fs.readFileSync(tmpFile, "utf8"));
    assert.equal(doc.points.length, 1);
    assert.equal(doc.points[0].price, 168.38);
  });

  it("creates parent directories if they do not exist", () => {
    const deepPath = path.join(tmpDir, "sub", "dir", "ISIN.json");
    upsertHistoryPoint(deepPath, "IE00BK5BQT80", "EUR", "2026-08-07", 168.38, "cron");
    assert.ok(fs.existsSync(deepPath));
  });

  it("throws on invalid ISIN", () => {
    assert.throws(() =>
      upsertHistoryPoint(tmpFile, "NOTANISIN000", "EUR", "2026-08-07", 168, "cron"),
    );
  });

  it("throws on invalid date", () => {
    assert.throws(
      () => upsertHistoryPoint(tmpFile, "IE00BK5BQT80", "EUR", "not-a-date", 168, "cron"),
      /Invalid date/,
    );
  });

  it("throws on invalid price (zero)", () => {
    assert.throws(
      () => upsertHistoryPoint(tmpFile, "IE00BK5BQT80", "EUR", "2026-08-07", 0, "cron"),
      /Invalid price/,
    );
  });

  it("throws on invalid price (negative)", () => {
    assert.throws(
      () => upsertHistoryPoint(tmpFile, "IE00BK5BQT80", "EUR", "2026-08-07", -1, "cron"),
      /Invalid price/,
    );
  });

  it("throws on empty source string", () => {
    assert.throws(
      () => upsertHistoryPoint(tmpFile, "IE00BK5BQT80", "EUR", "2026-08-07", 168, ""),
      /Invalid source/,
    );
  });
});

// ── bulkUpsertHistoryPoints ──────────────────────────────────────────────────

describe("bulkUpsertHistoryPoints", () => {
  beforeEach(setup);
  afterEach(teardown);

  it("writes many points at once into a new file", () => {
    const pts = [
      { date: "2026-08-05", price: 166, source: "backfill" },
      { date: "2026-08-06", price: 167, source: "backfill" },
      { date: "2026-08-07", price: 168, source: "backfill" },
    ];
    bulkUpsertHistoryPoints(tmpFile, "IE00BK5BQT80", "EUR", pts);
    const doc = JSON.parse(fs.readFileSync(tmpFile, "utf8"));
    assert.equal(doc.points.length, 3);
    assert.equal(doc.points[0].date, "2026-08-05");
  });

  it("merges with existing points, bulk wins on overlap", () => {
    upsertHistoryPoint(tmpFile, "IE00BK5BQT80", "EUR", "2026-08-07", 167.0, "cron");
    const pts = [
      { date: "2026-08-06", price: 166.0, source: "backfill" },
      { date: "2026-08-07", price: 168.38, source: "backfill" },
    ];
    bulkUpsertHistoryPoints(tmpFile, "IE00BK5BQT80", "EUR", pts);
    const doc = JSON.parse(fs.readFileSync(tmpFile, "utf8"));
    assert.equal(doc.points.length, 2);
    const aug7 = doc.points.find((p) => p.date === "2026-08-07");
    assert.equal(aug7?.price, 168.38);
    assert.equal(aug7?.source, "backfill");
  });

  it("silently drops invalid points within the bulk array", () => {
    const pts = [
      { date: "invalid", price: 166, source: "backfill" },
      { date: "2026-08-07", price: 0, source: "backfill" },
      { date: "2026-08-08", price: 168, source: "backfill" },
    ];
    bulkUpsertHistoryPoints(tmpFile, "IE00BK5BQT80", "EUR", pts);
    const doc = JSON.parse(fs.readFileSync(tmpFile, "utf8"));
    assert.equal(doc.points.length, 1);
    assert.equal(doc.points[0].date, "2026-08-08");
  });

  it("throws on invalid ISIN", () => {
    assert.throws(() =>
      bulkUpsertHistoryPoints(tmpFile, "NOTANISIN000", "EUR", []),
    );
  });
});
