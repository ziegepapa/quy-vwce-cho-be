/* One-time P25 legacy-cache recovery. Normal updates remain explicit owner actions. */
(() => {
  "use strict";

  const LEGACY_REGISTER_KEY = "registerSW.js?__WB_REVISION__=04b919dfdb8554a9d303a9d535f7839f";
  const MARKER_CACHE = "vwce-pwa-update-migration-v1";
  const MARKER_PATH = "/quy-vwce-cho-be/__pwa-update-migration-v1__";

  async function hasLegacyRegistrationScript() {
    const names = await caches.keys();
    for (const name of names) {
      const cache = await caches.open(name);
      const keys = await cache.keys();
      if (keys.some((request) => request.url.endsWith(LEGACY_REGISTER_KEY))) return true;
    }
    return false;
  }

  async function recoverDocumentedLegacyController() {
    const marker = await caches.open(MARKER_CACHE);
    if (await marker.match(MARKER_PATH)) return;
    if (!(await hasLegacyRegistrationScript())) return;

    await marker.put(MARKER_PATH, new Response("P25 legacy controller recovered"));
    await self.skipWaiting();
  }

  self.addEventListener("install", (event) => {
    event.waitUntil(recoverDocumentedLegacyController().catch(() => undefined));
  });
})();
