import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/mu4", testMatch:"mu4.spec.ts", workers:1, retries:0, timeout:120000,
  use:{browserName:"chromium",viewport:{width:390,height:844},trace:"off",screenshot:"off",video:"off",serviceWorkers:"block"},
  webServer:{command:"npx vite --host 127.0.0.1 --port 4173 --strictPort",url:"http://127.0.0.1:4173/quy-vwce-cho-be/",reuseExistingServer:false,timeout:120000},
});
