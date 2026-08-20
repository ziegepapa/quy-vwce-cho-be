import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFile(resolve(root, path), "utf8");

const recovery = await read("src/lib/recoveryReadOnly.tsx");
assert.match(recovery, /readOnly: boolean/);
assert.match(recovery, /RECOVERY_READONLY_MESSAGE/);
assert.match(recovery, /recovery-write-block/);
assert.match(recovery, /role="alert"/);

const backupGate = await read("src/lib/backupImportGate.ts");
assert.match(backupGate, /PendingSyncImportBlockedError/);
assert.match(backupGate, /pendingSyncImportBlock/);
assert.match(backupGate, /PENDING_SYNC_IMPORT_RISK/);

const workflow = await read(".github/workflows/deploy.yml");
for (const command of ["npm test", "npm run benchmark:ledger:check", "npm run audit:locale", "npm run build", "npm run check:bundle", "npm run test:release"]) {
  assert.match(workflow, new RegExp(command.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")), `workflow must run ${command}`);
}
assert.doesNotMatch(workflow, /OPENAI_API_KEY|ANTHROPIC_API_KEY|AI_API_KEY/);
assert.doesNotMatch(workflow, /supabase\.functions\.invoke/);

const runbook = await read("docs/OPERATIONS_RUNBOOK.md");
assert.match(runbook, /AI|KI|legacy/i);
assert.match(runbook, /Recovery|Wiederherstellung|khôi phục/i);
assert.match(runbook, /fail-closed|fail closed|không mở|nicht öffnen/i);

console.log("Operational posture OK: recovery/write boundary, backup gate, CI protections and no provider secret wiring are present.");
