import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const projectRoot = path.resolve(import.meta.dirname, "..");

export async function readAppReleaseVersion(root = projectRoot) {
  const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  assert.equal(typeof packageJson.version, "string", "package.json version must be a string");
  assert.match(packageJson.version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/, "package.json version must be SemVer-like");
  return packageJson.version;
}

export function assertVersionMatch(expected, actual, label) {
  assert.equal(actual, expected, `${label} version mismatch: expected ${expected}, received ${actual}`);
}

export function readReleaseVersionFromHtml(html) {
  const match = /<meta\s+name=["']vwce-app-release-version["']\s+content=["']([^"']+)["']\s*\/?>/i.exec(html);
  assert.ok(match?.[1], "Release artifact is missing vwce-app-release-version metadata");
  return match[1];
}
