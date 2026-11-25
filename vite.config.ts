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
      // The static production CSP intentionally excludes loopback. Only the
      // explicitly enabled, disposable Vite dev rehearsal needs local Auth/REST.
      name: "mu4-local-rehearsal-csp",
      apply: "serve",
      transformIndexHtml(html, context) {
        if (!context.server ||
            process.env.VITE_MU3_LOCAL_REHEARSAL !== "true" ||
            process.env.VITE_SUPABASE_URL !== "http://127.0.0.1:54321") return html;
        const productionConnect = "connect-src 'self' https://*.supabase.co wss://*.supabase.co;";
        if (!html.includes(productionConnect)) throw new Error("MU4 local CSP baseline changed");
        return html.replace(productionConnect,
          "connect-src 'self' https://*.supabase.co wss://*.supabase.co http://127.0.0.1:54321;");
      },
    },
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
      // Keep 192px and maskable icons offline; the full 512px PNG remains online
    // for installation, but is redundant in the offline precache.
    includeManifestIcons: false,
    includeAssets: ["icons/*.svg", "icons/icon-192.png", "icons/icon-maskable-512.png"],
      manifest: {
        id: "/quy-vwce-cho-be/",
        name: "VWCE Vault",
        short_name: "VWCE Vault",
        description: "Theo dõi danh mục, đặt mục tiêu và mô phỏng kế hoạch đầu tư dài hạn. Dùng được ngoại tuyến.",
        theme_color: "#1e3a5f",
        background_color: "#06060a",
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
        globPatterns: ["**/*.{js,css,html,svg,png,webp,ico,woff2,json,webmanifest}"],
        // Price data changes daily and is fetched fresh on every app boot /
        // refresh (fetch uses cache: "no-store"). Precaching it would serve
        // the build-time price until the service worker updates, which is
        // exactly the "app cập nhật chậm" symptom. The app already falls
        // back to local IndexedDB data when offline, so no data file needs
        // to be precached.
        globIgnores: ["**/data/**", "**/icons/icon-512.png", "**/assets/VallHealthPanel-*.js", "**/assets/VallHealthPanel-*.css", "**/assets/overview-mountain-*.webp"],
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
      "src/bootPaint.test.js",
      "src/pages/Goals.loadState.test.tsx",
      "src/pages/Overview.loadState.test.tsx",
      "src/pages/continuitySnapshot.test.ts",
      "src/pages/Settings.pendingSyncImport.test.tsx",
      "src/components/GeminiVaultExplainer.test.tsx",
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
      "src/pages/ConfidenceTimeline.loadState.test.tsx",
    ],
  },
});
