import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/mu3", testMatch: "mu3.spec.ts", workers: 1, retries: 0, timeout: 90000,
  use: { browserName: "chromium", viewport: { width: 390, height: 844 }, trace: "off", screenshot: "off", video: "off", serviceWorkers: "block" },
  webServer: { command: "npx vite --host 127.0.0.1 --port 4173 --strictPort", url: "http://127.0.0.1:4173/quy-vwce-cho-be/tests/mu3/fixture.html", reuseExistingServer: false, timeout: 120000 },
});
