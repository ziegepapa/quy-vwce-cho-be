/* P27: bounded follow-up for the P25 stale shell. Never navigates write-capable routes. */
(() => {
  "use strict";

  const PREVIOUS_MARKER_CACHE = "vwce-pwa-update-migration-v1";
  const PREVIOUS_MARKER_PATH = "/quy-vwce-cho-be/__pwa-update-migration-v1__";
  const FINAL_MARKER_CACHE = "vwce-pwa-final-runtime-recovery-v1";
  const FINAL_MARKER_PATH = "/quy-vwce-cho-be/__pwa-final-runtime-recovery-v1__";
  const BASE_PATH = "/quy-vwce-cho-be/";

  function isSafeLegacyClient(url) {
    const next = new URL(url);
    return next.pathname === BASE_PATH && (next.hash === "#/" || next.hash === "#/overview");
  }

  async function wasP25RecoveryApplied() {
    const previous = await caches.open(PREVIOUS_MARKER_CACHE);
    return Boolean(await previous.match(PREVIOUS_MARKER_PATH));
  }

  async function recoverSafeLegacyClients() {
    const final = await caches.open(FINAL_MARKER_CACHE);
    if (await final.match(FINAL_MARKER_PATH)) return;
    if (!(await wasP25RecoveryApplied())) return;

    await final.put(FINAL_MARKER_PATH, new Response("P27 stale runtime recovery completed"));
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    await Promise.all(
      clients
        .filter((client) => isSafeLegacyClient(client.url))
        .map((client) => client.navigate(client.url).catch(() => undefined)),
    );
  }

  self.addEventListener("activate", (event) => {
    event.waitUntil(recoverSafeLegacyClients().catch(() => undefined));
  });
})();
