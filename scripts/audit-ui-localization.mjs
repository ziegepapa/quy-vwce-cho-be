import { access, readdir, readFile } from "node:fs/promises";
import { dirname, extname, relative, resolve, sep } from "node:path";

const projectRoot = resolve(".");
const sourceRoot = resolve(projectRoot, "src");
const candidateRoots = [resolve(sourceRoot, "pages"), resolve(sourceRoot, "components")];
const productEntryPoints = [resolve(sourceRoot, "main.tsx")];
const sourceExtensions = [".ts", ".tsx"];
const vietnameseDiacritic = /[À-ỹ]/u;
// A component is exempt only when it uses the locale system itself or documents
// a verified bilingual contract (for example, language-safe fallback labels).
const localeMarkers = /\buseLocale\b|\blocale\s*===|\bDisplayLocale\b|\bAppLocale\b|locale-audit:\s*bilingual-contract/u;
const importFrom = /(?:^|[\r\n])\s*(?:import|export)\s+(?:type\s+)?[\w*${},\s]+\s+from\s*["']([^"']+)["']/gu;
const directImport = /(?:^|[\r\n])\s*import\s*["']([^"']+)["']/gu;
const dynamicImport = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/gu;

function displayPath(path) {
  return relative(projectRoot, path).split(sep).join("/");
}

async function listSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return listSourceFiles(path);
    return sourceExtensions.includes(extname(entry.name)) && !/\.test\./.test(entry.name) ? [path] : [];
  }));
  return nested.flat().sort();
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function resolveLocalImport(fromPath, specifier) {
  if (!specifier.startsWith(".")) return null;
  const base = resolve(dirname(fromPath), specifier);
  const attempts = extname(base)
    ? [base]
    : [
      ...sourceExtensions.map((extension) => `${base}${extension}`),
      ...sourceExtensions.map((extension) => resolve(base, `index${extension}`)),
    ];
  for (const candidate of attempts) {
    if (await fileExists(candidate)) return candidate;
  }
  return null;
}

function localSpecifiers(source) {
  const specifiers = new Set();
  for (const pattern of [importFrom, directImport, dynamicImport]) {
    for (const match of source.matchAll(pattern)) specifiers.add(match[1]);
  }
  return [...specifiers];
}

async function buildImportGraph(files) {
  const graph = new Map();
  for (const path of files) {
    const source = await readFile(path, "utf8");
    const imports = await Promise.all(localSpecifiers(source).map((specifier) => resolveLocalImport(path, specifier)));
    graph.set(path, imports.filter((entry) => entry !== null));
  }
  return graph;
}

function reachableFrom(entryPoints, graph) {
  const reachable = new Set();
  const pending = [...entryPoints];
  while (pending.length > 0) {
    const path = pending.pop();
    if (!path || reachable.has(path)) continue;
    reachable.add(path);
    for (const dependency of graph.get(path) ?? []) pending.push(dependency);
  }
  return reachable;
}

const files = await listSourceFiles(sourceRoot);
const graph = await buildImportGraph(files);
const reachable = reachableFrom(productEntryPoints, graph);
const candidates = [];

for (const path of (await Promise.all(candidateRoots.map(listSourceFiles))).flat().sort()) {
  const source = await readFile(path, "utf8");
  if (!vietnameseDiacritic.test(source) || localeMarkers.test(source)) continue;
  candidates.push(path);
}

const activeCandidates = candidates.filter((path) => reachable.has(path)).map(displayPath);
const legacyCandidates = candidates.filter((path) => !reachable.has(path)).map(displayPath);
const result = {
  scope: ["src/pages", "src/components"],
  entryPoints: productEntryPoints.map(displayPath),
  mode: "active-locale-policy",
  activeCandidates,
  legacyCandidates,
  activeCandidateCount: activeCandidates.length,
  legacyCandidateCount: legacyCandidates.length,
  passed: activeCandidates.length === 0,
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!result.passed) process.exitCode = 1;
