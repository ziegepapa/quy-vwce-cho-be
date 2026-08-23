/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { VitePWA } from "vite-plugin-pwa";
import appPackage from "./package.json" with { type: "json" };

const appReleaseVersion = appPackage.version;

export default defineConfig({
  base: "/quy-vwce-cho-be/",
  define: {
    __APP_RELEASE_VERSION__: JSON.stringify(appReleaseVersion),
  },
  plugins: [
    react(),
    {
      name: "app-release-version-metadata",
      transformIndexHtml(html) {
        return html.replace(
          "</head>",
          `    <meta name="vwce-app-release-version" content="${appReleaseVersion}">\n  </head>`,
        );
      },
    },
    VitePWA({
      registerType: "prompt",
      injectRegister: "script-defer",
      includeAssets: ["icons/*.svg", "icons/*.png"],
      manifest: {
        id: "/quy-vwce-cho-be/",
        name: "Quỹ VWCE cho bé",
        short_name: "VWCE bé",
        description: "Theo dõi kế hoạch VWCE dài hạn; mốc mục tiêu hiện tại là 2042. Dùng được offline.",
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
        importScripts: [
          "pwa-update-recovery.js",
          "pwa-final-runtime-recovery.js",
          "pwa-p34-update-recovery.js",
        ],
        skipWaiting: false,
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
      "src/lib/auth.recovery.test.ts",
      "src/pages/Auth.recovery.test.tsx",
      "src/App.recoveryGate.test.tsx",
      "src/styles/demoV10VisualRegression.test.js",
      "src/styles/txFilterSheetSafeArea.test.js",
      "src/pages/Goals.loadState.test.tsx",
      "src/pages/Overview.loadState.test.tsx",
      "src/pages/continuitySnapshot.test.ts",
      "src/pages/Settings.pendingSyncImport.test.tsx",
      "src/components/AppFailureBoundary.test.tsx",
      "src/components/ModalAccessibilityManager.test.tsx",
      "src/components/LocalDiagnosticsPanel.test.tsx",
      "src/components/LocalDataInventoryPanel.test.tsx",
      "src/components/SyncHealthSummary.test.tsx",
      "src/pages/Transactions.loadState.test.tsx",
      "src/pages/Notfallmappe.initialLoad.test.tsx",
      "src/pages/Notfallmappe.saveState.test.tsx",
      "src/pages/SimulationRoute.test.tsx",
      "src/components/QuoteFeedRefresh.test.tsx",
      "src/pages/Settings.initialLoad.test.tsx",
      "src/pages/Settings.operationErrors.test.tsx",
      "src/components/SettingsCboWorkspace.yearlyPlan.test.tsx",
      "src/pages/MigrateWizard.test.tsx",
    ],
  },
});
