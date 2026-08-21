import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = fileURLToPath(new URL("..", import.meta.url));

test("financial-policy guard passes when public UI has no tax or prescriptive glide surface", async () => {
  const { stdout } = await execFileAsync(
    process.execPath,
    ["scripts/check-financial-policy-boundary.mjs"],
    { cwd: root },
  );
  assert.match(stdout, /Financial-policy boundary OK/);
});
