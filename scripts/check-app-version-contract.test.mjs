import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = fileURLToPath(new URL("..", import.meta.url));

test("application version contract guard passes for package-driven release metadata", async () => {
  const { stdout } = await execFileAsync(
    process.execPath,
    ["scripts/check-app-version-contract.mjs"],
    { cwd: root },
  );
  assert.match(stdout, /App-version contract OK: app \d+\.\d+\.\d+; Dexie 4; backup 4; Supabase 2\./);
});
