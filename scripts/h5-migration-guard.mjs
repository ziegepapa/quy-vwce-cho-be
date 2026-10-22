#!/usr/bin/env node
/**
 * H5 — migration order guard with redacted machine-readable evidence.
 * Ensures SQL migration filenames form a contiguous sequence starting at 001.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "supabase", "migrations");
const files = fs.readdirSync(root).filter((f) => f.endsWith(".sql")).sort();

function finish(result, message, checkedFiles = files) {
  const evidence = {
    schemaVersion: 1,
    kind: "H5_MIGRATION_ORDER",
    sourceCommit: process.env.SOURCE_COMMIT ?? process.env.GITHUB_SHA ?? null,
    workflowRunId: process.env.GITHUB_RUN_ID ?? null,
    generatedAt: new Date().toISOString(),
    result,
    message,
    migrations: checkedFiles.map((file) => ({
      file,
      sha256: createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex"),
    })),
  };
  fs.writeFileSync("h5-migration-evidence.json", JSON.stringify(evidence, null, 2) + "\n", { mode: 0o600 });
  if (result !== "PASS") {
    console.error("FAIL: " + message);
    process.exit(1);
  }
  console.log("PASS: " + message + ": " + checkedFiles.join(", "));
}

function normalizeReviewedBaseline(sql) {
  return sql
    .split(/\\r?\\n/)
    .filter((line) => !/^\\s*--/.test(line))
    .filter((line) => !/^\\s*drop policy if exists\\b/i.test(line))
    .join("\\n")
    .replace(/\\s+/g, " ")
    .trim();
}

if (!files.length) {
  finish("FAIL", "no migration files", files);
}

const repoRoot = path.join(root, "..");
const reviewedSchemaPath = path.join(repoRoot, "schema.sql");
const baselinePath = path.join(root, "001_baseline_schema.sql");
if (!fs.existsSync(reviewedSchemaPath) || !fs.existsSync(baselinePath)) {
  finish("FAIL", "reviewed schema.sql or 001 baseline is missing", files);
}
const reviewedSchema = fs.readFileSync(reviewedSchemaPath, "utf8");
const baselineSchema = fs.readFileSync(baselinePath, "utf8");
if (normalizeReviewedBaseline(reviewedSchema) !== normalizeReviewedBaseline(baselineSchema)) {
  finish("FAIL", "001 baseline differs from supabase/schema.sql beyond comments/idempotent policy drops", files);
}

const nums = [];
for (const file of files) {
  const match = /^(\d{3})_/.exec(file);
  if (!match) finish("FAIL", "unnumbered migration file: " + file, files);
  nums.push(Number(match[1]));
}

if (new Set(nums).size !== nums.length) {
  finish("FAIL", "duplicate migration numbers", files);
}

if (nums[0] !== 1) {
  finish("FAIL", "baseline must start at 001; got " + String(nums[0]).padStart(3, "0"), files);
}

for (let i = 0; i < nums.length; i++) {
  if (nums[i] !== i + 1) {
    finish("FAIL", "gap or disorder at index " + i + ": expected " + (i + 1) + ", got " + nums[i], files);
  }
}

finish("PASS", "ordered migrations verified", files);
