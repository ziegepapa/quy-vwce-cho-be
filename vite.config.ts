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
      includeAssets: ["icons/*.svg"],
      manifest: {
        name: "Quỹ VWCE cho bé",
        short_name: "VWCE bé",
        description: "Theo dõi kế hoạch VWCE 2026–2042 offline",
        theme_color: "#1e3a8a",
        background_color: "#f4f6fb",
        display: "standalone",
        lang: "vi",
        start_url: "/quy-vwce-cho-be/",
        scope: "/quy-vwce-cho-be/",
        icons: [
          { src: "icons/icon-192.svg", sizes: "192x192", type: "image/svg+xml", purpose: "any" },
          { src: "icons/icon-512.svg", sizes: "512x512", type: "image/svg+xml", purpose: "any" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,ico,woff2}"],
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
    include: ["src/**/*.test.ts"],
  },
});
