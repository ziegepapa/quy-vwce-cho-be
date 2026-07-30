import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { SyncStatus } from "../lib/sync/types";
import { SYNC_STATUS_LABEL } from "../lib/sync/types";

function hashHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h % 360;
}

export function avatarGradient(name: string): string {
  const hue = hashHue(name || "?");
  return `linear-gradient(135deg, hsl(${hue}, 55%, 42%), hsl(${(hue + 40) % 360}, 60%, 55%))`;
}

export default function AvatarMenu({
  open,
  onClose,
  displayName,
  syncStatus,
  pending,
  onSignOut,
  onSyncNow,
}: {
  open: boolean;
  onClose: () => void;
  displayName: string;
  syncStatus: SyncStatus;
  pending: number;
  onSignOut: () => void;
  onSyncNow?: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const initial = (displayName.trim()[0] || "?").toUpperCase();

  return createPortal(
    <>
      <div className="menu-scrim" onPointerDown={onClose} aria-hidden />
      <div className="avatar-menu-portal" role="menu" aria-label="Menu tài khoản">
        <div className="avatar-menu-head">
          <div
            className="avatar avatar-menu-av"
            style={{ background: avatarGradient(displayName) }}
            aria-hidden
          >
            {initial}
          </div>
          <div>
            <strong className="avatar-menu-name">{displayName}</strong>
            <div className="avatar-menu-sub">
              {SYNC_STATUS_LABEL[syncStatus]}
              {pending > 0 ? ` · ${pending} chờ` : ""}
            </div>
          </div>
        </div>
        <div className="avatar-menu-rule" />
        {onSyncNow && (
          <button
            type="button"
            role="menuitem"
            className="avatar-menu-item"
            onClick={() => {
              onClose();
              onSyncNow();
            }}
          >
            Đồng bộ ngay
          </button>
        )}
        <div className="avatar-menu-rule" />
        <button
          type="button"
          role="menuitem"
          className="avatar-menu-item danger-item"
          onClick={() => {
            onClose();
            onSignOut();
          }}
        >
          Đăng xuất
        </button>
      </div>
    </>,
    document.body,
  );
}
