(() => {
  "use strict";

  const BASE = "/quy-vwce-cho-be/";
  const SW_URL = `${BASE}sw.js`;
  const NOTICE_ID = "vwce-pwa-update-notice";
  let registration = null;
  let activationRequested = false;

  const copy = {
    vi: {
      title: "Đã có phiên bản mới",
      body: "Cập nhật sau khi bạn chọn Cập nhật.",
      update: "Cập nhật",
      later: "Để sau",
      activating: "Đang cập nhật…",
      unsafe: "Hãy hoàn tất thao tác đang mở trước khi cập nhật.",
    },
    de: {
      title: "Neue App-Version verfügbar",
      body: "Die Aktualisierung startet erst nach Ihrer Bestätigung.",
      update: "Aktualisieren",
      later: "Später",
      activating: "Aktualisierung läuft…",
      unsafe: "Bitte schließen Sie die aktuelle Aktion ab, bevor Sie aktualisieren.",
    },
  };

  function locale() {
    try {
      return window.localStorage.getItem("vwce-locale") === "de" ? "de" : "vi";
    } catch {
      return "vi";
    }
  }

  function isReloadSafe() {
    return !document.querySelector(
      ".modal-backdrop, [role=dialog], [role=alertdialog], [aria-busy=true], .set-security-setup",
    );
  }

  function removeNotice() {
    document.getElementById(NOTICE_ID)?.remove();
  }

  function renderNotice() {
    if (!registration?.waiting || !navigator.serviceWorker.controller || document.getElementById(NOTICE_ID)) return;

    const text = copy[locale()];
    const notice = document.createElement("aside");
    notice.id = NOTICE_ID;
    notice.className = "pwa-update-prompt pwa-update-bridge";
    notice.setAttribute("role", "status");
    notice.setAttribute("aria-live", "polite");
    notice.setAttribute("data-testid", "pwa-update-notice");

    const content = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = text.title;
    const body = document.createElement("p");
    body.textContent = text.body;
    content.append(title, body);

    const actions = document.createElement("div");
    actions.className = "pwa-update-actions";
    const update = document.createElement("button");
    update.type = "button";
    update.textContent = text.update;
    const later = document.createElement("button");
    later.type = "button";
    later.className = "ghost";
    later.textContent = text.later;

    later.addEventListener("click", removeNotice);
    update.addEventListener("click", () => {
      const waiting = registration?.waiting;
      if (!waiting || activationRequested) return;
      if (!isReloadSafe()) {
        body.textContent = text.unsafe;
        return;
      }

      activationRequested = true;
      update.disabled = true;
      update.textContent = text.activating;
      navigator.serviceWorker.addEventListener(
        "controllerchange",
        () => window.location.reload(),
        { once: true },
      );
      waiting.postMessage({ type: "SKIP_WAITING" });
    });

    actions.append(update, later);
    notice.append(content, actions);
    document.body.append(notice);
  }

  function inspectUpdate(nextRegistration) {
    registration = nextRegistration;
    if (registration.waiting) renderNotice();
  }

  function bindRegistration(nextRegistration) {
    inspectUpdate(nextRegistration);
    nextRegistration.addEventListener("updatefound", () => {
      const installing = nextRegistration.installing;
      if (!installing) return;
      installing.addEventListener("statechange", () => {
        if (installing.state === "installed") inspectUpdate(nextRegistration);
      });
    });
  }

  function checkForUpdate() {
    if (document.visibilityState === "visible") void registration?.update?.().catch(() => undefined);
  }

  function start() {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register(SW_URL, {
      scope: BASE,
      updateViaCache: "none",
    }).then(bindRegistration).catch(() => undefined);

    window.addEventListener("focus", checkForUpdate);
    document.addEventListener("visibilitychange", checkForUpdate);
  }

  if (document.readyState === "complete") start();
  else window.addEventListener("load", start, { once: true });
})();
