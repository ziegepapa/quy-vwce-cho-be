import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { projectRoot, readAppReleaseVersion } from "./app-release-version.mjs";

async function readProjectFile(relativePath) {
  return readFile(path.join(projectRoot, relativePath), "utf8");
}

function readNumberConstant(source, name, sourceLabel) {
  const match = new RegExp(`export const ${name} = (\\d+);`).exec(source);
  assert.ok(match?.[1], `${sourceLabel} must export ${name}`);
  return Number(match[1]);
}

function latestDexieSchemaVersion(source) {
  const versions = [...source.matchAll(/this\.version\((\d+)\)/g)].map((match) => Number(match[1]));
  assert.ok(versions.length > 0, "Dexie schema declarations are missing");
  return Math.max(...versions);
}

async function latestSupabaseSchemaVersion() {
  const files = await readdir(path.join(projectRoot, "supabase", "migrations"));
  const versions = files
    .map((file) => /^(\d+)_/.exec(file)?.[1])
    .filter(Boolean)
    .map(Number);
  assert.ok(versions.length > 0, "Supabase migration history is missing");
  return Math.max(...versions);
}

const [appReleaseVersion, viteConfig, appVersionModule, settingsPage, releaseVerifier, productionVerifier, typesSource, dexieSource, designSystem, supabaseSchemaVersion] = await Promise.all([
  readAppReleaseVersion(),
  readProjectFile("vite.config.ts"),
  readProjectFile("src/lib/appVersion.ts"),
  readProjectFile("src/pages/Settings.tsx"),
  readProjectFile("scripts/verify-release.mjs"),
  readProjectFile("scripts/verify-production.mjs"),
  readProjectFile("src/lib/types.ts"),
  readProjectFile("src/lib/db.m01a.ts"),
  readProjectFile("docs/DESIGN_SYSTEM.md"),
  latestSupabaseSchemaVersion(),
]);

assert.match(viteConfig, /import appPackage from "\.\/package\.json"/);
assert.match(viteConfig, /const appReleaseVersion = appPackage\.version/);
assert.match(viteConfig, /__APP_RELEASE_VERSION__: JSON\.stringify\(appReleaseVersion\)/);
assert.match(viteConfig, /name="vwce-app-release-version"/);
assert.match(appVersionModule, /export const APP_RELEASE_VERSION = __APP_RELEASE_VERSION__;/);
assert.doesNotMatch(typesSource, /\bAPP_VERSION\b/);
assert.match(settingsPage, /import \{ APP_RELEASE_VERSION \} from "\.\.\/lib\/appVersion"/);
assert.match(settingsPage, /v\{APP_RELEASE_VERSION\}/);
assert.doesNotMatch(settingsPage, /SETTINGS_UI_VERSION|v\d+\.\d+\.\d+/);
assert.match(releaseVerifier, /readAppReleaseVersion/);
assert.match(releaseVerifier, /readReleaseVersionFromHtml/);
assert.match(productionVerifier, /readAppReleaseVersion/);
assert.match(productionVerifier, /readReleaseVersionFromHtml/);
assert.doesNotMatch(designSystem, /currently\s+\d+\.\d+\.\d+/i);

const backupSchemaVersion = readNumberConstant(typesSource, "BACKUP_SCHEMA_VERSION", "src/lib/types.ts");
const declaredDexieSchemaVersion = readNumberConstant(typesSource, "DEXIE_DB_VERSION", "src/lib/types.ts");
const dexieSchemaVersion = latestDexieSchemaVersion(dexieSource);
assert.equal(declaredDexieSchemaVersion, dexieSchemaVersion, "DEXIE_DB_VERSION must describe the latest declared Dexie schema");
assert.equal(backupSchemaVersion, 4, "H1 must not change backup schema compatibility");
assert.equal(dexieSchemaVersion, 4, "H1 must not change Dexie schema");
assert.equal(supabaseSchemaVersion, 2, "H1 must not change Supabase migration state");
assert.notEqual(appReleaseVersion, String(backupSchemaVersion), "App release and backup schema are separate namespaces");

console.log(`App-version contract OK: app ${appReleaseVersion}; Dexie ${dexieSchemaVersion}; backup ${backupSchemaVersion}; Supabase ${supabaseSchemaVersion}.`);
