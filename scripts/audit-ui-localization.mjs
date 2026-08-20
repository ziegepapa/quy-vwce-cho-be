import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve("src");
const candidateRoots = [resolve(root, "pages"), resolve(root, "components")];
const vietnameseDiacritic = /[À-ỹ]/u;
const localeMarkers = /useLocale|locale\s*===|DisplayLocale|AppLocale/u;

async function listSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return listSourceFiles(path);
    return /\.(?:ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name) ? [path] : [];
  }));
  return nested.flat();
}

const files = (await Promise.all(candidateRoots.map(listSourceFiles))).flat();
const candidates = [];
for (const path of files) {
  const source = await readFile(path, "utf8");
  if (!vietnameseDiacritic.test(source) || localeMarkers.test(source)) continue;
  candidates.push(path.replace(`${resolve(".")}/`, ""));
}

process.stdout.write(`${JSON.stringify({
  scope: ["src/pages", "src/components"],
  mode: "report-only",
  candidates,
  candidateCount: candidates.length,
}, null, 2)}\n`);
