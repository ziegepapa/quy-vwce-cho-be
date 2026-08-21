import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function walk(relativePath) {
  const absolutePath = path.join(root, relativePath);
  return fs.readdirSync(absolutePath, { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(relativePath, entry.name);
    if (entry.isDirectory()) return walk(child);
    return [child];
  });
}

function fail(message) {
  failures.push(message);
}

const indexHtml = read("index.html");
const cspMatch = indexHtml.match(/<meta\s+http-equiv=["']Content-Security-Policy["']\s+content=(?:"([^"]*)"|'([^']*)')/i);
if (!cspMatch) {
  fail("index.html must declare a Content-Security-Policy meta tag for static hosting.");
} else {
  const policy = cspMatch[1] ?? cspMatch[2] ?? "";
  for (const required of [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self'",
    "script-src 'self'",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
  ]) {
    if (!policy.includes(required)) fail(`CSP is missing required directive fragment: ${required}`);
  }
  if (/script-src[^;]*\bunsafe-inline\b/i.test(policy)) fail("CSP must not allow inline scripts.");
  if (/script-src[^;]*\bunsafe-eval\b/i.test(policy)) fail("CSP must not allow eval in client scripts.");
}

const clientFiles = walk("src").filter((file) => /\.(?:ts|tsx|js|jsx)$/.test(file));
const forbiddenPatterns = [
  { label: "service-role key reference", pattern: /SUPABASE_SERVICE_ROLE|service_role/i },
  { label: "dynamic code evaluation", pattern: /\beval\s*\(|\bnew\s+Function\s*\(/ },
  { label: "raw HTML sink", pattern: /dangerouslySetInnerHTML|\.innerHTML\s*=/ },
];

for (const relativePath of clientFiles) {
  const source = read(relativePath);
  for (const { label, pattern } of forbiddenPatterns) {
    if (pattern.test(source)) fail(`${relativePath} contains forbidden ${label}.`);
  }
}

if (failures.length > 0) {
  console.error("Client security boundary guard failed:");
  for (const message of failures) console.error(`- ${message}`);
  process.exit(1);
}

console.log(`Client security boundary guard passed (${clientFiles.length} source files checked).`);
