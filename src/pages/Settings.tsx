import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  clearAllData,
  db,
  exportBackup,
  getOrCreateChecklist,
  getSettings,
  importBackup,
  listTransactions,
  saveSettings,
} from "../lib/db";
import type { AnnualChecklist, AppSettings, BackupPayload } from "../lib/types";
import { APP_VERSION, SCHEMA_VERSION } from "../lib/types";
import { isSupportedBackupSchema } from "../lib/backupSchema";
import { csvEscape, formatDateVN, parseDecimal } from "../lib/calc";
import type { ThemeChoice } from "../lib/theme";
import { THEME_OPTIONS, persistTheme, readTheme } from "../lib/theme";
import { useAuth } from "../lib/auth";
import { listDeadOutbox, pushOutbox, reviveDeadOutbox } from "../lib/sync/engine";
import type { OutboxItem } from "../lib/sync/types";
import SettingsPricePanel from "../components/SettingsPricePanel";
import SyncConflictSection from "../components/SyncConflictSection";

type SettingsTab = "general" | "prices" | "data";
type SaveState = "saved" | "dirty" | "saving" | "error";

const SETTINGS_AUTOSAVE_MS = 650;

function pctDisplay(decimal: number): string {
  if (!Number.isFinite(decimal)) return "—";
  return `${(decimal * 100).toLocaleString("vi-VN", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  })} %`;
}

/** 2.5 → 0.025, tránh rác dấu phẩy động của phép chia số thực. */
function pctToRate(pct: number): number {
  return Math.round(pct * 1e4) / 1e6;
}

function formatNum(n: number, minFrac: number, maxFrac: number): string {
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString("vi-VN", {
    minimumFractionDigits: minFrac,
    maximumFractionDigits: maxFrac,
  });
}

// REMAINDER_LOADED_FROM_LOCAL_FILE - this is a marker that will fail CI if full file not uploaded
export default function SettingsPage({ onReload, onOpenMigrate }: { onReload: () => void; onOpenMigrate?: () => void }) {
  return <p>INCOMPLETE_UPLOAD</p>;
}
