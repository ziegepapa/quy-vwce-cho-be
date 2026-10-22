#!/usr/bin/env node
/**
 * H5 — migration order guard with redacted machine-readable evidence.
 * Ensures SQL migration filenames form a contiguous sequence starting at 001.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateMigrationSet } from "./h5-migration-guard-lib.mjs";

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

if (!files.length) {
  finish("FAIL", "no migration files", files);
}

const repoRoot = path.join(root, "..");
const reviewedSchemaPath = path.join(repoRoot, "schema.sql");
if (!fs.existsSync(reviewedSchemaPath)) {
  finish("FAIL", "reviewed schema.sql is missing", files);
}
const reviewedSchema = fs.readFileSync(reviewedSchemaPath, "utf8");
let validation;
try {
  validation = validateMigrationSet(
    files,
    (file) => fs.readFileSync(path.join(root, file), "utf8"),
    reviewedSchema
  );
} catch (error) {
  finish("FAIL", error instanceof Error ? error.message : String(error), files);
}
finish("PASS", validation.message, files);
