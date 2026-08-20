import {
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { useLocale } from "../lib/locale";

type PopoverProps = {
  open: boolean;
  onClose: () => void;
  triggerRef: RefObject<HTMLElement | null>;
  panelClassName: string;
  children: ReactNode;
};

export default function Popover({
  open,
  onClose,
  triggerRef,
  panelClassName,
  children,
}: PopoverProps) {
  const { locale } = useLocale();
  const panelRef = useRef<HTMLDivElement>(null);

  // onClose là hàm mới mỗi lần render của navbar (navbar re-render theo
  // từng pixel cuộn). Giữ trong ref để KHÔNG đưa vào deps của effect,
  // tránh vòng hủy/tạo lại effect làm giành focus liên tục.
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const getItems = useCallback((): HTMLElement[] => {
    const root = panelRef.current;
    if (!root) return [];
    return Array.from(
      root.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])'),
    );
  }, []);

  // Effect 1: focus vào item đầu khi mở, trả focus về trigger khi đóng.
  useEffect(() => {
    if (!open) return;

    const trigger = triggerRef.current;
    const raf = requestAnimationFrame(() => {
      const items = getItems();
      if (items.length > 0) {
        items[0].focus();
      } else {
        panelRef.current?.focus();
      }
    });

    return () => {
      cancelAnimationFrame(raf);
      if (trigger && typeof trigger.focus === "function") {
        trigger.focus();
      }
    };
  }, [open, getItems, triggerRef]);

  // Effect 2: bàn phím — Escape, Tab trap, Arrow/Home/End.
  useEffect(() => {
    if (!open) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }

      const panel = panelRef.current;
      if (!panel) return;

      if (e.key === "Tab") {
        const focusable = Array.from(
          panel.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        ).filter(
          (el) => el.offsetParent !== null || el === document.activeElement,
        );

        if (focusable.length === 0) {
          e.preventDefault();
          return;
        }

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;

        if (e.shiftKey) {
          if (active === first || !panel.contains(active)) {
            e.preventDefault();
            last.focus();
          }
        } else if (active === last || !panel.contains(active)) {
          e.preventDefault();
          first.focus();
        }
        return;
      }

      if (
        e.key !== "ArrowDown" &&
        e.key !== "ArrowUp" &&
        e.key !== "Home" &&
        e.key !== "End"
      ) {
        return;
      }

      const list = getItems();
      if (list.length === 0) return;

      e.preventDefault();
      const active = document.activeElement as HTMLElement | null;
      let idx = list.indexOf(active as HTMLElement);

      if (e.key === "Home") {
        list[0].focus();
        return;
      }
      if (e.key === "End") {
        list[list.length - 1].focus();
        return;
      }
      if (e.key === "ArrowDown") {
        idx = idx < 0 ? 0 : (idx + 1) % list.length;
        list[idx].focus();
        return;
      }
      if (e.key === "ArrowUp") {
        idx = idx < 0 ? list.length - 1 : (idx - 1 + list.length) % list.length;
        list[idx].focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, getItems]);

  if (!open) return null;

  // Portal vào document.body: panel nằm ngoài cây DOM của navbar nên
  // không thể làm tăng scrollWidth của body -> không còn scroll ngang.
  return createPortal(
    <>
      <div
        className="menu-scrim"
        aria-hidden
        onPointerDown={(e) => {
          e.preventDefault();
          onCloseRef.current();
        }}
      />
      <div
        ref={panelRef}
        className={panelClassName}
        role="menu"
        aria-label={locale === "de" ? "Kontomenü" : "Menu tài khoản"}
        tabIndex={-1}
      >
        {children}
      </div>
    </>,
    document.body,
  );
}
