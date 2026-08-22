/// <reference types="vite-plugin-pwa/react" />

import { useEffect, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { useLocale } from "../lib/locale";

type PwaCopy = {
  title: string;
  body: string;
  refresh: string;
  later: string;
};

function pwaCopy(locale: "vi" | "de"): PwaCopy {
  return locale === "de"
    ? {
      title: "Neue App-Version verfügbar",
      body: "Laden Sie die neue Version, um die aktuelle Oberfläche zu verwenden.",
      refresh: "Jetzt neu laden",
      later: "Später",
    }
    : {
      title: "Có phiên bản ứng dụng mới",
      body: "Tải phiên bản mới để dùng giao diện hiện tại.",
      refresh: "Tải lại ngay",
      later: "Để sau",
    };
}

/** Requests a service-worker update without throwing into the UI. */
export function requestPwaUpdate(registration: ServiceWorkerRegistration): void {
  void registration.update().catch(() => undefined);
}

/**
 * Global, authenticated-and-unauthenticated PWA update prompt.
 * Reload is deliberate: an owner must select the action after a new SW is waiting.
 */
export default function PwaUpdatePrompt() {
  const { locale } = useLocale();
  const text = pwaCopy(locale);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisteredSW: (_swUrl, serviceWorkerRegistration) => {
      setRegistration(serviceWorkerRegistration ?? null);
    },
  });

  useEffect(() => {
    if (!registration) return;
    const checkForUpdate = () => requestPwaUpdate(registration);
    const checkWhenVisible = () => {
      if (document.visibilityState === "visible") checkForUpdate();
    };

    checkWhenVisible();
    window.addEventListener("focus", checkForUpdate);
    document.addEventListener("visibilitychange", checkWhenVisible);
    return () => {
      window.removeEventListener("focus", checkForUpdate);
      document.removeEventListener("visibilitychange", checkWhenVisible);
    };
  }, [registration]);

  if (!needRefresh) return null;

  return (
    <aside className="pwa-update-prompt" role="status" aria-live="polite" data-testid="pwa-update-prompt">
      <div>
        <strong>{text.title}</strong>
        <p>{text.body}</p>
      </div>
      <div className="pwa-update-actions">
        <button type="button" onClick={() => void updateServiceWorker(true)}>{text.refresh}</button>
        <button type="button" className="ghost" onClick={() => setNeedRefresh(false)}>{text.later}</button>
      </div>
    </aside>
  );
}
