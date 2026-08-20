import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = fileURLToPath(new URL("..", import.meta.url));

test("external-boundary guard passes for the current local-first runtime", async () => {
  const { stdout } = await execFileAsync(process.execPath, ["scripts/check-external-boundary.mjs"], { cwd: root });
  assert.match(stdout, /External-boundary OK/);
});
