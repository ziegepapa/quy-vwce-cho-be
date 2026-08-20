import type { RefObject } from "react";
import type { SyncStatus } from "../lib/sync/types";
import { THEME_LABEL, readTheme } from "../lib/theme";
import Popover from "./Popover";
import { useLocale } from "../lib/locale";

function menuCopy(locale: "vi" | "de") {
  return locale === "de" ? {
    user: "Nutzer", syncNow: "Jetzt synchronisieren", emergency: "Notfallmappe", handoff: "Übergabe-Übersicht", handoffMeta: "Lokal", timeline: "Status-Zeitleiste", timelineMeta: "Metadaten", settings: "Einstellungen", signOut: "Abmelden", safe: "Sicher", pending: (count: number) => `${count} ausstehend`, status: { offline: "Auf diesem Gerät", syncing: "Synchronisierung", synced: "Synchronisiert", conflict: "Konflikt" } satisfies Record<SyncStatus, string>,
  } : {
    user: "Người dùng", syncNow: "Đồng bộ ngay", emergency: "Hồ sơ khẩn cấp", handoff: "Tóm tắt bàn giao", handoffMeta: "Cục bộ", timeline: "Dòng thời gian trạng thái", timelineMeta: "Metadata", settings: "Cài đặt", signOut: "Đăng xuất", safe: "An toàn", pending: (count: number) => `${count} chờ`, status: { offline: "Trên thiết bị", syncing: "Đang đồng bộ", synced: "Đã đồng bộ", conflict: "Xung đột" } satisfies Record<SyncStatus, string>,
  };
}

export function avatarGradient(name: string): string {
  let hash = 0;
  const s = name.trim() || "?";
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) | 0;
  }
  const h1 = Math.abs(hash) % 360;
  const h2 = (h1 + 40 + (Math.abs(hash >> 8) % 40)) % 360;
  return `linear-gradient(135deg, hsl(${h1} 62% 46%), hsl(${h2} 58% 38%))`;
}

type AvatarMenuProps = {
  open: boolean;
  onClose: () => void;
  displayName: string;
  email?: string;
  syncStatus: SyncStatus;
  pending: number;
  onSignOut: () => void;
  onSyncNow?: () => void;
  triggerRef: RefObject<HTMLElement | null>;
};

export default function AvatarMenu({
  open,
  onClose,
  displayName,
  email,
  syncStatus,
  pending,
  onSignOut,
  onSyncNow,
  triggerRef,
}: AvatarMenuProps) {
  const { locale } = useLocale();
  const text = menuCopy(locale);
  const initial = (displayName.trim()[0] || "?").toUpperCase();
  const gradient = avatarGradient(displayName);
  const subLabel = email ?? text.status[syncStatus];
  const metaLabel = pending > 0 ? text.pending(pending) : text.status[syncStatus];
  const themeLabel = THEME_LABEL[readTheme()];

  return (
    <Popover
      open={open}
      onClose={onClose}
      triggerRef={triggerRef}
      panelClassName="avatar-menu-portal"
    >
      <div className="avatar-menu-head" role="presentation">
        <div
          className="avatar avatar-menu-av"
          style={{ background: gradient }}
          aria-hidden
        >
          {initial}
        </div>
        <div>
          <span className="avatar-menu-name">{displayName || text.user}</span>
          <div className="avatar-menu-sub">{subLabel}</div>
        </div>
      </div>
      <div className="avatar-menu-rule" role="presentation" />
      <button
        type="button"
        className="avatar-menu-item"
        role="menuitem"
        disabled={!onSyncNow}
        onClick={() => {
          onSyncNow?.();
          onClose();
        }}
      >
        {text.syncNow}
        <span className="avatar-menu-item-meta">{metaLabel}</span>
      </button>
      <a
        className="avatar-menu-item"
        role="menuitem"
        href="#/notfallmappe"
        onClick={onClose}
      >
        {text.emergency}
        <span className="avatar-menu-item-meta">{text.safe}</span>
      </a>
      <a
        className="avatar-menu-item"
        role="menuitem"
        href="#/handoff"
        onClick={onClose}
      >
        {text.handoff}
        <span className="avatar-menu-item-meta">{text.handoffMeta}</span>
      </a>
      <a
        className="avatar-menu-item"
        role="menuitem"
        href="#/timeline"
        onClick={onClose}
      >
        {text.timeline}
        <span className="avatar-menu-item-meta">{text.timelineMeta}</span>
      </a>
      <a
        className="avatar-menu-item"
        role="menuitem"
        href="#/settings"
        onClick={onClose}
      >
        {text.settings}
        <span className="avatar-menu-item-meta">{themeLabel}</span>
      </a>
      <div className="avatar-menu-rule" role="presentation" />
      <button
        type="button"
        className="avatar-menu-item danger-item"
        role="menuitem"
        onClick={() => {
          onClose();
          onSignOut();
        }}
      >
        {text.signOut}
      </button>
    </Popover>
  );
}
