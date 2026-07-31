import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type MenuAction = {
  label: string;
  onClick: () => void | Promise<void>;
  danger?: boolean;
};

const WIDTH = 200;
const ROW_H = 46;
const EDGE = 12;

/**
 * V9 B4 — menu "…" trên từng thẻ.
 *
 * Bản cũ dùng position:absolute bên trong .goal-card. Card có border-radius +
 * overflow nên panel bị cắt và bị đẩy lên đầu màn. Lớp nền đóng menu lại nghe
 * pointerdown, nên cú chạm vào "Sửa"/"Xóa" bị nuốt trước khi onClick chạy.
 *
 * Bản này:
 * - render qua portal vào document.body, position: fixed
 * - toạ độ tính từ getBoundingClientRect() của chính nút bấm
 * - tự lật lên trên khi không đủ chỗ phía dưới, tự kẹp trong mép màn hình
 * - đóng menu TRƯỚC rồi mới chạy action ở tick sau, để confirm() không bị chặn
 */
export default function ActionMenu({
  actions,
  ariaLabel = "Tùy chọn",
}: {
  actions: MenuAction[];
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const h = actions.length * ROW_H + 12;

    let left = r.right - WIDTH;
    const maxLeft = window.innerWidth - WIDTH - EDGE;
    if (left > maxLeft) left = maxLeft;
    if (left < EDGE) left = EDGE;

    let top = r.bottom + 6;
    if (top + h > window.innerHeight - EDGE) {
      const above = r.top - 6 - h;
      top = above > EDGE ? above : Math.max(EDGE, window.innerHeight - EDGE - h);
    }

    setPos({ top, left });
  }, [actions.length]);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (open && pos) panelRef.current?.focus();
  }, [open, pos]);

  function run(action: MenuAction) {
    setOpen(false);
    // Chạy ở tick sau: menu đã unmount nên confirm() không bị lớp nền nuốt.
    setTimeout(() => {
      void action.onClick();
    }, 0);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{
          width: 36,
          height: 36,
          minHeight: 36,
          padding: 0,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 10,
          border: "none",
          background: open ? "rgba(16,24,40,0.06)" : "transparent",
          color: "var(--text-tertiary, #8a99b0)",
          cursor: "pointer",
          flexShrink: 0,
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="12" cy="5" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="12" cy="19" r="1.8" />
        </svg>
      </button>

      {open && pos
        ? createPortal(
            <>
              <div
                onPointerDown={() => setOpen(false)}
                style={{
                  position: "fixed",
                  inset: 0,
                  zIndex: "var(--z-scrim, 60)" as unknown as number,
                  background: "rgba(11,13,20,0.12)",
                  backdropFilter: "blur(2px)",
                  WebkitBackdropFilter: "blur(2px)",
                }}
              />
              <div
                ref={panelRef}
                role="menu"
                aria-label={ariaLabel}
                tabIndex={-1}
                style={{
                  position: "fixed",
                  top: pos.top,
                  left: pos.left,
                  width: WIDTH,
                  zIndex: "var(--z-popover, 70)" as unknown as number,
                  padding: 6,
                  borderRadius: 14,
                  background: "var(--surface-raised, #fff)",
                  border: "1px solid rgba(16,24,40,0.06)",
                  boxShadow: "0 12px 32px -8px rgba(16,24,40,0.24), 0 2px 6px rgba(16,24,40,0.08)",
                  outline: "none",
                }}
              >
                {actions.map((a) => (
                  <button
                    key={a.label}
                    type="button"
                    role="menuitem"
                    onClick={() => run(a)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      width: "100%",
                      height: 44,
                      minHeight: 44,
                      padding: "0 12px",
                      border: "none",
                      borderRadius: 10,
                      background: "transparent",
                      color: a.danger
                        ? "var(--danger-600, #c2334a)"
                        : "var(--text-primary, #0b1220)",
                      fontSize: 15,
                      fontWeight: 500,
                      textAlign: "left",
                      cursor: "pointer",
                    }}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </>,
            document.body,
          )
        : null}
    </>
  );
}
