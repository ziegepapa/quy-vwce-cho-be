import type { RefObject } from "react";
import type { SyncStatus } from "../lib/sync/types";
import { SYNC_STATUS_LABEL } from "../lib/sync/types";
import { THEME_LABEL, readTheme } from "../lib/theme";
import Popover from "./Popover";

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
  const initial = (displayName.trim()[0] || "?").toUpperCase();
  const gradient = avatarGradient(displayName);
  const subLabel = email ?? SYNC_STATUS_LABEL[syncStatus];
  const metaLabel = pending > 0 ? `${pending} chờ` : SYNC_STATUS_LABEL[syncStatus];
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
          <span className="avatar-menu-name">{displayName || "Người dùng"}</span>
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
        Đồng bộ ngay
        <span className="avatar-menu-item-meta">{metaLabel}</span>
      </button>
      <a
        className="avatar-menu-item"
        role="menuitem"
        href="#/notfallmappe"
        onClick={onClose}
      >
        Hồ sơ khẩn cấp
        <span className="avatar-menu-item-meta">An toàn</span>
      </a>
      <a
        className="avatar-menu-item"
        role="menuitem"
        href="#/settings"
        onClick={onClose}
      >
        Cài đặt
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
        Đăng xuất
      </button>
    </Popover>
  );
}
