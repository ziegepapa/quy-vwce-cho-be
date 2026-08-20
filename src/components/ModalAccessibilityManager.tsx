import { useEffect } from "react";

const MODAL_SELECTOR = '[aria-modal="true"]';
const FOCUSABLE_SELECTOR = [
  '[data-dialog-initial-focus]','button:not([disabled])','a[href]','input:not([disabled]):not([type="hidden"])','select:not([disabled])','textarea:not([disabled])','[tabindex]:not([tabindex="-1"])',
].join(",");
// `data-dialog-close` is the primary contract. Text matching remains a locale-aware
// fallback for legacy dialogs and authoring mistakes, never for a destructive action.
const SAFE_CLOSE_COPY = /^(hủy|đóng|quay lại|để sau|cancel|close|zurück|abbrechen|schließen|schliessen)\b/i;

function topModal(): HTMLElement | null {
  const dialogs = document.querySelectorAll<HTMLElement>(MODAL_SELECTOR);
  return dialogs.length > 0 ? dialogs[dialogs.length - 1] : null;
}

function focusableElements(dialog: HTMLElement): HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((element) => {
    if (element.hasAttribute("disabled") || element.getAttribute("aria-hidden") === "true") return false;
    if (element.closest('[hidden], [aria-hidden="true"]')) return false;
    return element.tabIndex >= 0;
  });
}

function safeCloseControl(dialog: HTMLElement, focusable: HTMLElement[]): HTMLElement | null {
  const explicit = dialog.querySelector<HTMLElement>("[data-dialog-close]");
  if (explicit && focusable.includes(explicit)) return explicit;
  return focusable.find((element) => {
    if (!(element instanceof HTMLButtonElement)) return false;
    const label = element.getAttribute("aria-label") ?? element.textContent ?? "";
    return SAFE_CLOSE_COPY.test(label.trim());
  }) ?? null;
}

function initialFocus(dialog: HTMLElement): HTMLElement {
  const focusable = focusableElements(dialog);
  const explicit = dialog.querySelector<HTMLElement>("[data-dialog-initial-focus]");
  if (explicit && focusable.includes(explicit)) return explicit;
  return safeCloseControl(dialog, focusable)
    ?? focusable.find((element) => element.hasAttribute("autofocus"))
    ?? focusable[0]
    ?? dialog;
}

/**
 * Adds consistent modal keyboard behavior without changing page data flows.
 * Existing dialogs keep their own submit/cancel handlers; this manager only
 * controls focus and activates an explicit, safely named close control on Escape.
 */
export default function ModalAccessibilityManager() {
  useEffect(() => {
    let activeDialog: HTMLElement | null = null;
    let previousFocus: HTMLElement | null = null;
    let addedTabIndex = false;

    function focusInside(dialog: HTMLElement) {
      const target = initialFocus(dialog);
      if (target === dialog && !dialog.hasAttribute("tabindex")) {
        dialog.setAttribute("tabindex", "-1");
        addedTabIndex = true;
      }
      target.focus({ preventScroll: true });
    }

    function deactivate(restore: boolean) {
      const dialog = activeDialog;
      const restoreTarget = previousFocus;
      if (dialog && addedTabIndex) dialog.removeAttribute("tabindex");
      activeDialog = null;
      previousFocus = null;
      addedTabIndex = false;
      if (restore && restoreTarget?.isConnected) restoreTarget.focus({ preventScroll: true });
    }

    function activate(dialog: HTMLElement) {
      activeDialog = dialog;
      previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      addedTabIndex = false;
      queueMicrotask(() => {
        if (activeDialog === dialog && dialog.isConnected) focusInside(dialog);
      });
    }

    function syncActiveDialog() {
      const next = topModal();
      if (next === activeDialog) return;
      if (activeDialog) deactivate(true);
      if (next) activate(next);
    }

    function onKeyDown(event: KeyboardEvent) {
      const dialog = activeDialog;
      if (!dialog || !dialog.isConnected) return;

      if (event.key === "Escape") {
        const controls = focusableElements(dialog);
        const close = safeCloseControl(dialog, controls);
        if (!close) return;
        event.preventDefault();
        event.stopPropagation();
        close.click();
        return;
      }

      if (event.key !== "Tab") return;
      const controls = focusableElements(dialog);
      if (controls.length === 0) {
        event.preventDefault();
        focusInside(dialog);
        return;
      }
      const first = controls[0];
      const last = controls[controls.length - 1];
      const focused = document.activeElement;
      if (event.shiftKey && (focused === first || !dialog.contains(focused))) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && (focused === last || !dialog.contains(focused))) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    }

    function onFocusIn(event: FocusEvent) {
      const dialog = activeDialog;
      const target = event.target;
      if (!dialog || !(target instanceof Node) || dialog.contains(target)) return;
      focusInside(dialog);
    }

    const observer = new MutationObserver(syncActiveDialog);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["aria-modal", "hidden"],
      childList: true,
      subtree: true,
    });
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("focusin", onFocusIn, true);
    syncActiveDialog();

    return () => {
      observer.disconnect();
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("focusin", onFocusIn, true);
      if (activeDialog) deactivate(true);
    };
  }, []);

  return null;
}
