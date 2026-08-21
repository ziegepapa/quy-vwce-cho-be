import assert from "node:assert/strict";
import { test } from "node:test";
import { assertVersionMatch, readAppReleaseVersion, readReleaseVersionFromHtml } from "./app-release-version.mjs";

test("package release version is a valid canonical application version", async () => {
  const version = await readAppReleaseVersion();
  assert.match(version, /^\d+\.\d+\.\d+/);
});

test("version matcher accepts an exact runtime/artifact match", () => {
  assert.doesNotThrow(() => assertVersionMatch("1.6.0", "1.6.0", "artifact"));
});

test("version matcher fails closed on runtime/artifact mismatch", () => {
  assert.throws(
    () => assertVersionMatch("1.6.0", "9.9.9", "artifact"),
    /artifact version mismatch: expected 1\.6\.0, received 9\.9\.9/,
  );
});

test("release metadata parser fails closed when metadata is missing or stale", () => {
  assert.equal(
    readReleaseVersionFromHtml('<meta name="vwce-app-release-version" content="1.6.0">'),
    "1.6.0",
  );
  assert.throws(
    () => readReleaseVersionFromHtml("<html><head></head></html>"),
    /missing vwce-app-release-version metadata/,
  );
  assert.throws(
    () => assertVersionMatch("1.6.0", "1.5.9", "release artifact"),
    /release artifact version mismatch/,
  );
});
