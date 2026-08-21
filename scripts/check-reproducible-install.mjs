import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const packageJson = readJson("package.json");
const packageLock = readJson("package-lock.json");
const deployWorkflow = readText(".github/workflows/deploy.yml");
const quoteWorkflow = readText(".github/workflows/update-vwce-price.yml");
const playwrightVersion = packageJson.devDependencies?.["@playwright/test"];

if (packageLock.lockfileVersion !== 3) failures.push("package-lock.json must use npm lockfileVersion 3.");
if (!/^\d+\.\d+\.\d+$/.test(playwrightVersion ?? "")) failures.push("@playwright/test must be pinned to an exact version.");
if (packageLock.packages?.["node_modules/@playwright/test"]?.version !== playwrightVersion) {
  failures.push("package-lock Playwright version must exactly match package.json.");
}
if (!deployWorkflow.includes("- run: npm ci")) failures.push("deploy workflow must use npm ci.");
if (deployWorkflow.includes("npm install") || deployWorkflow.includes("--no-save @playwright/test")) {
  failures.push("deploy workflow must not bypass package-lock with npm install or no-save Playwright installs.");
}
if (!deployWorkflow.includes(`mcr.microsoft.com/playwright:v${playwrightVersion}-jammy`)) {
  failures.push("preview browser image must exactly match locked @playwright/test version.");
}
if (!quoteWorkflow.includes("run: npm ci") || quoteWorkflow.includes("npm install")) {
  failures.push("scheduled quote workflow must use npm ci and not npm install.");
}

if (failures.length > 0) {
  console.error("Reproducible install guard failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Reproducible install guard passed (lockfile v${packageLock.lockfileVersion}, Playwright ${playwrightVersion}).`);
