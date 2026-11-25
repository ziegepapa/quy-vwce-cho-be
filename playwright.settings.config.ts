import { defineConfig } from "@playwright/test";
import preview from "./playwright.config";

export default defineConfig({
  ...preview,
  testMatch: "**/settings-sheet.local.ts",
  outputDir: "test-results-settings",
  timeout: 60_000,
});
