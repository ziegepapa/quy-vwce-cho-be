import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { resolve, relative } from "node:path";

const root = resolve(import.meta.dirname, "..");
const sourceRoot = resolve(root, "src");
const legacyAiModule = "src/lib/aiTraceExplanation.ts";
const ownerApprovedGeminiUi = "src/components/GeminiVaultExplainer.tsx";

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
  if (path === ownerApprovedGeminiUi) {
    // Narrow owner-approved exception: exactly one explicitly clicked, authenticated
    // Supabase Edge Function. Legacy Trace/OpenAI and dynamic functions remain banned.
    const approvedCalls = [...source.matchAll(/supabase\\.functions\\.invoke\\s*\\(\\s*["']([^"']+)["']/g)]
      .map((match) => match[1]);
    const totalInvokes = (source.match(/supabase\\.functions\\.invoke\\s*\\(/g) || []).length;
    if (approvedCalls.length !== totalInvokes ||
        !approvedCalls.length ||
        approvedCalls.some((name) => name !== "gemini-vault-explain") ||
        forbiddenRuntimePatterns.some((pattern, i) => i !== 2 && pattern.test(source))) {
      offenders.push(path);
    }
    continue;
  }
  if (forbiddenRuntimePatterns.some((pattern) => pattern.test(source))) offenders.push(path);
}
assert.deepEqual(
  offenders,
  [],
  `Production runtime may call only the owner-approved manual Gemini Edge Function; all legacy AI remains banned: ${offenders.join(", ")}`,
);

const workflow = await readFile(resolve(root, ".github/workflows/deploy.yml"), "utf8");
assert.match(workflow, /VITE_AI_TRACE_ENABLED:\s*\$\{\{ vars\.VITE_AI_TRACE_ENABLED \}\}/);
assert.match(workflow, /npm run test:edge-smoke/);
assert.doesNotMatch(workflow, /npm run verify:production/);

const isolatedSmoke = await readFile(resolve(root, "scripts/smoke-ai-edge.mjs"), "utf8");
assert.match(isolatedSmoke, /AI_API_URL:\s*`http:\/\/127\.0\.0\.1:\$\{mockPort\}\/v1\/chat\/completions`/);
assert.doesNotMatch(isolatedSmoke, /https:\/\/api\./);

console.log("External-boundary OK: only explicit Gemini Edge caller is allowed; no legacy AI access; isolated smoke uses loopback mock only.");
