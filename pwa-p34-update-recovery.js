/* P35: exact, one-time bootstrap for the documented P33 bridge cache only. */
(() => {
  "use strict";

  const P33_REGISTER_KEY = "registerSW.js?__WB_REVISION__=0a19d4c3d2fdcddc9ad27bd6a1b88215";
  const MARKER_CACHE = "vwce-pwa-p34-update-migration-v1";
  const MARKER_PATH = "/quy-vwce-cho-be/__pwa-p34-update-migration-v1__";

  async function hasDocumentedP33Bridge() {
    const names = await caches.keys();
    for (const name of names) {
      const cache = await caches.open(name);
      const keys = await cache.keys();
      if (keys.some((request) => request.url.endsWith(P33_REGISTER_KEY))) return true;
    }
    return false;
  }

  async function advanceDocumentedP33Worker() {
    const marker = await caches.open(MARKER_CACHE);
    if (await marker.match(MARKER_PATH)) return;
    if (!(await hasDocumentedP33Bridge())) return;

    await marker.put(MARKER_PATH, new Response("P35 P33 worker bootstrap completed"));
    // This only advances the new worker. It never reloads or navigates a client.
    await self.skipWaiting();
  }

  self.addEventListener("install", (event) => {
    event.waitUntil(advanceDocumentedP33Worker().catch(() => undefined));
  });
})();
