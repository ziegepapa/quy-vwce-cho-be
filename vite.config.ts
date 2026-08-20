/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "/quy-vwce-cho-be/",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/*.svg", "icons/*.png"],
      manifest: {
        id: "/quy-vwce-cho-be/",
        name: "Quỹ VWCE cho bé",
        short_name: "VWCE bé",
        description: "Theo dõi kế hoạch VWCE 2026–2042 offline",
        theme_color: "#1e3a5f",
        background_color: "#f4f6fb",
        display: "standalone",
        lang: "vi",
        start_url: "/quy-vwce-cho-be/",
        scope: "/quy-vwce-cho-be/",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          {
            src: "icons/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
          { src: "icons/icon-512.svg", sizes: "512x512", type: "image/svg+xml", purpose: "any" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2,json,webmanifest}"],
        navigateFallback: "/quy-vwce-cho-be/index.html",
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  test: {
    environment: "node",
    include: [
      "src/**/*.test.ts",
      // Giữ contract thị giác demo (màu hiệu suất và card Giá) ngoài TS build.
      "src/styles/demoV10VisualRegression.test.js",
      // PR0: bat dan tung file .test.tsx da doc toan bo source.
      "src/pages/Goals.loadState.test.tsx",
      "src/pages/Overview.loadState.test.tsx",
      // PR0.1: test cong nhap sao luu cua PR3. Da doc tron Settings.tsx,
      // Settings.pendingSyncImport.test.tsx va backupImportGate.ts truoc khi bat.
      "src/pages/Settings.pendingSyncImport.test.tsx",
      // PR0.2: test ranh gioi loi toan app. Da doc tron AppFailureBoundary.tsx
      // va AppFailureBoundary.test.tsx tren main truoc khi bat.
      "src/components/AppFailureBoundary.test.tsx",
      // P5.0: dialog keyboard contract — the suite explicitly focuses the trigger
      // before click in jsdom, so it can assert Escape and focus restoration.
      "src/components/ModalAccessibilityManager.test.tsx",
      // P6.1: local-only diagnostics surface — verifies German/Vietnamese copy
      // and that untrusted stored payload fields cannot be rendered.
      "src/components/LocalDiagnosticsPanel.test.tsx",
      // P6.3: Sync guidance must stay accessible, localized and explicitly safe.
      "src/components/SyncHealthSummary.test.tsx",
      // PR0.3: test ranh gioi loi toan app.Giao dich. Da doc tron Transactions.tsx
      // va Transactions.loadState.test.tsx tren main truoc khi bat.
      "src/pages/Transactions.loadState.test.tsx",
      // PR0.5 (lo lon 7 file): da doc TOAN VAN tren main 39b4ec66 truoc khi bat
      // Notfallmappe.tsx; SimulationRoute.tsx + PageFailureBoundary.tsx +
      // operationErrors.ts; QuoteFeedRefresh.tsx + quoteFreshness.ts;
      // Settings.tsx; MigrateWizard.tsx + defaults.ts.
      "src/pages/Notfallmappe.initialLoad.test.tsx",
      "src/pages/Notfallmappe.saveState.test.tsx",
      "src/pages/SimulationRoute.test.tsx",
      "src/components/QuoteFeedRefresh.test.tsx",
      "src/pages/Settings.initialLoad.test.tsx",
      "src/pages/Settings.operationErrors.test.tsx",
      "src/pages/MigrateWizard.test.tsx",
      // CHUA BAT - can PR sua rieng trong file test, khong sua production:
      // - src/pages/Settings.test.tsx (FINDING_NOTION_50: mock cu, thieu
      //   PlanRoadmapSection va ../lib/recoveryReadOnly).
    ],
  },
});
