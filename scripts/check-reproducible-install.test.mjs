import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("reproducible install guard passes for the locked CI contract", () => {
  const result = spawnSync(process.execPath, ["scripts/check-reproducible-install.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /Reproducible install guard passed/);
});
