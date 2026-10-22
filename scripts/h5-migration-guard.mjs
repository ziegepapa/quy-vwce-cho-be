#!/usr/bin/env node
/**
 * H5 — migration numbering guard.
 * Fails if supabase/migrations lacks a contiguous ordered prefix starting at 001,
 * or if numbers duplicate / are unparseable.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "supabase", "migrations");
const files = fs.readdirSync(root).filter((f) => f.endsWith(".sql")).sort();

if (!files.length) {
  console.error("FAIL: no migration files");
  process.exit(1);
}

const nums = [];
for (const f of files) {
  const m = /^(\d{3})_/.exec(f);
  if (!m) {
    console.error(`FAIL: unnumbered migration file: ${f}`);
    process.exit(1);
  }
  nums.push(Number(m[1]));
}

const unique = new Set(nums);
if (unique.size !== nums.length) {
  console.error("FAIL: duplicate migration numbers", nums);
  process.exit(1);
}

if (nums[0] !== 1) {
  console.error(`FAIL: baseline must start at 001, got ${String(nums[0]).padStart(3, "0")}`);
  process.exit(1);
}

for (let i = 0; i < nums.length; i++) {
  if (nums[i] !== i + 1) {
    console.error(`FAIL: gap or disorder at index ${i}: expected ${i + 1}, got ${nums[i]}`);
    process.exit(1);
  }
}

console.log("PASS: ordered migrations", files.join(", "));
