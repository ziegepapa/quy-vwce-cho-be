import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("client security boundary guard passes for the current static runtime", () => {
  const result = spawnSync(process.execPath, ["scripts/check-client-security-boundary.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /Client security boundary guard passed/);
});
