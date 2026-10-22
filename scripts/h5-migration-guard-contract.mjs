import assert from "node:assert/strict";
import test from "node:test";
import { validateMigrationSet } from "./h5-migration-guard-lib.mjs";

const schema = "-- approved repository schema\ncreate table public.sample (id integer primary key);\n";
const baseline = "-- 001 baseline\ncreate table public.sample (id integer primary key);\n";
const baseFile = "001_baseline_schema.sql";
const migration2 = "002_soft_delete_and_triggers.sql";

function validate(entries, options = {}) {
  const values = new Map([
    [baseFile, baseline],
    [migration2, "-- Depends-On: " + baseFile + "\nalter table public.sample add column deleted_at timestamptz;\n"],
    ...entries,
  ]);
  const files = options.files || [baseFile, migration2];
  if (options.baseline !== undefined) values.set(baseFile, options.baseline);
  return validateMigrationSet(files, (file) => values.get(file) ?? "", schema);
}

test("accepts a contiguous chain with reviewed baseline and declared predecessor", () => {
  assert.equal(validate([]).files.length, 2);
});

test("fails when migration numbering has a gap", () => {
  assert.throws(
    () => validate([], { files: [baseFile, "003_later.sql"] }),
    /gap or disorder/
  );
});

test("fails duplicate migration numbers", () => {
  assert.throws(
    () => validate([], { files: [baseFile, "001_duplicate.sql"] }),
    /duplicate migration numbers/
  );
});

test("fails when a migration has no dependency declaration", () => {
  assert.throws(
    () => validate([[migration2, "alter table public.sample add column deleted_at timestamptz;"]]),
    /dependency declaration must appear exactly once/
  );
});

test("fails when a migration declares no dependency after baseline", () => {
  assert.throws(
    () => validate([[migration2, "-- Depends-On: none\nalter table public.sample add column deleted_at timestamptz;"]]),
    /dependency is undeclared/
  );
});

test("fails for unknown dependency", () => {
  assert.throws(
    () => validate([[migration2, "-- Depends-On: 009_missing.sql\nalter table public.sample add column deleted_at timestamptz;"]]),
    /unknown dependency/
  );
});

test("fails for a forward dependency", () => {
  const third = "003_followup.sql";
  const fourth = "004_next.sql";
  const customEntries = [
    [migration2, "-- Depends-On: " + baseFile + "\nalter table public.sample add column deleted_at timestamptz;"],
    [third, "-- Depends-On: " + fourth + "\nselect 1;"],
    [fourth, "-- Depends-On: " + third + "\nselect 1;"],
  ];
  assert.throws(
    () => validate(customEntries, { files: [baseFile, migration2, third, fourth] }),
    /migration dependency must precede/
  );
});

test("fails when baseline differs from the reviewed schema", () => {
  assert.throws(
    () => validate([], { baseline: "-- different\ncreate table public.sample (id text primary key);\n" }),
    /001 baseline differs/
  );
});
