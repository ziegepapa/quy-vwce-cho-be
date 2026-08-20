import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { resolve, relative } from "node:path";

const root = resolve(import.meta.dirname, "..");
const sourceRoot = resolve(root, "src");
const legacyAiModule = "src/lib/aiTraceExplanation.ts";
const allowedLegacyCallers = new Set([
  legacyAiModule,
  "src/lib/aiTraceExplanation.test.ts",
]);
const forbiddenRuntimePatterns = [
  /aiTraceExplanation/,
  /explain-trace/,
  /supabase\.functions\.invoke\s*\(/,
  /\bopenai\b/i,
  /\bai[_-]?api[_-]?key\b/i,
];

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(path));
    else if (/\.(?:ts|tsx|js|jsx)$/.test(entry.name)) files.push(path);
  }
  return files;
}

function isProductionRuntime(relativePath) {
  return !relativePath.endsWith(".test.ts")
    && !relativePath.endsWith(".test.tsx")
    && relativePath !== legacyAiModule;
}

const offenders = [];
for (const file of await listFiles(sourceRoot)) {
  const path = relative(root, file);
  if (!isProductionRuntime(path) || allowedLegacyCallers.has(path)) continue;
  const source = await readFile(file, "utf8");
  if (forbiddenRuntimePatterns.some((pattern) => pattern.test(source))) offenders.push(path);
}
assert.deepEqual(
  offenders,
  [],
  `Production runtime must not call legacy AI/Edge infrastructure or add an AI client: ${offenders.join(", ")}`,
);

const workflow = await readFile(resolve(root, ".github/workflows/deploy.yml"), "utf8");
assert.match(workflow, /VITE_AI_TRACE_ENABLED:\s*\$\{\{ vars\.VITE_AI_TRACE_ENABLED \}\}/);
assert.match(workflow, /npm run test:edge-smoke/);
assert.doesNotMatch(workflow, /npm run verify:production/);

const isolatedSmoke = await readFile(resolve(root, "scripts/smoke-ai-edge.mjs"), "utf8");
assert.match(isolatedSmoke, /AI_API_URL:\s*`http:\/\/127\.0\.0\.1:\$\{mockPort\}\/v1\/chat\/completions`/);
assert.doesNotMatch(isolatedSmoke, /https:\/\/api\./);

console.log("External-boundary OK: no production UI caller for legacy AI/Edge infrastructure; isolated smoke uses loopback mock only.");
