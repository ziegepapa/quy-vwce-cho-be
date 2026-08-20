import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const auditScript = new URL("./audit-ui-localization.mjs", import.meta.url).pathname;
const temporaryRoots = [];

async function writeFixture(files) {
  const root = await mkdtemp(join(tmpdir(), "vwce-locale-audit-"));
  temporaryRoots.push(root);
  await Promise.all(Object.entries(files).map(async ([path, source]) => {
    const target = join(root, path);
    const directory = target.slice(0, target.lastIndexOf("/"));
    await mkdir(directory, { recursive: true });
    await writeFile(target, source);
  }));
  return root;
}

function runAudit(cwd) {
  const result = spawnSync(process.execPath, [auditScript], {
    cwd,
    encoding: "utf8",
  });
  return {
    status: result.status,
    output: JSON.parse(result.stdout),
    stderr: result.stderr,
  };
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("audit-ui-localization", () => {
  it("fails only for production-reachable candidates and reports legacy candidates separately", async () => {
    const root = await writeFixture({
      "src/main.tsx": [
        'import "./pages/StaticActive";',
        'void import("./components/DynamicActive");',
        'import "./components/BilingualContract";',
      ].join("\n"),
      "src/pages/StaticActive.tsx": 'export const copy = "Không được bỏ sót";\n',
      "src/components/DynamicActive.tsx": 'export const copy = "Đóng";\n',
      "src/components/BilingualContract.tsx": '// locale-audit: bilingual-contract\nexport const close = /^(đóng|schließen)$/i;\n',
      "src/components/LegacyOnly.tsx": 'export const copy = "Chỉ còn từ bản cũ";\n',
      "src/components/LocaleAware.tsx": 'const locale = "de"; export const copy = locale === "de" ? "Schließen" : "Đóng";\n',
    });

    const result = runAudit(root);

    assert.equal(result.status, 1, result.stderr);
    assert.deepEqual(result.output.activeCandidates, [
      "src/components/DynamicActive.tsx",
      "src/pages/StaticActive.tsx",
    ]);
    assert.deepEqual(result.output.legacyCandidates, ["src/components/LegacyOnly.tsx"]);
    assert.equal(result.output.passed, false);
  });

  it("passes when all production-reachable candidates have a locale or bilingual contract", async () => {
    const root = await writeFixture({
      "src/main.tsx": 'import "./components/BilingualContract";\n',
      "src/components/BilingualContract.tsx": '// locale-audit: bilingual-contract\nexport const close = /^(đóng|schließen)$/i;\n',
      "src/pages/LegacyOnly.tsx": 'export const copy = "Chỉ còn từ bản cũ";\n',
    });

    const result = runAudit(root);

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.output.activeCandidates, []);
    assert.deepEqual(result.output.legacyCandidates, ["src/pages/LegacyOnly.tsx"]);
    assert.equal(result.output.passed, true);
  });
});
