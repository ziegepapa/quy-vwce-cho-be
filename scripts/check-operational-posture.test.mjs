import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe("operational-posture guard", () => {
  it("passes against the current recovery and release contracts", () => {
    const output = execFileSync(process.execPath, [resolve(root, "scripts/check-operational-posture.mjs")], { cwd: root, encoding: "utf8" });
    assert.match(output, /Operational posture OK/);
  });
});
