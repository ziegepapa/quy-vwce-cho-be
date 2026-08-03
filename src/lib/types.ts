export type GoalMode = "nominal" | "purchasing_power";
export type GoalUrgency = "hard" | "flexible";

/** V10-A — một người cần được báo tin trong tình huống khẩn cấp. */
export type EmergencyContact = {
  id: string;
  name: string;
  relation: string;
  phone: string;
  email: string;
};

/**
 * V10-A — NƠI CẤT một giấy tờ gốc. Không bao giờ là bản chụp giấy tờ,
 * và tuyệt đối không chứa mật khẩu, PIN hay TAN.
 */
export type DocumentLocation = {
  id: string;
  label: string;
  location: string;
};

/**
 * V10-A — Hồ sơ khẩn cấp.
 *
 * Lưu bên trong AppSettings chứ không phải bảng riêng, để thừa hưởng sẵn
 * cơ chế đồng bộ và sao lưu của settings mà không phải nâng phiên bản Dexie.
 */
export type Notfallmappe = {
  purpose: string;
  custodyNote: string;
  brokerName: string;
  brokerAccountType: string;
  isin: string;
  cashBankName: string;
  cashAccountNote: string;
  contacts: EmergencyContact[];
  documents: DocumentLocation[];
  wishes: string;
  /** V10-A2 — lần in gần nhất. Bản in giấy mới là bản người thân dùng được. */
  lastPrintedAt?: string;
  updatedAt: string;
};

export type AppSettings = {
  id: string; planName: string; childName: string; accountType: "child" | "parent";
  currency: "EUR"; inflationRate: number; vwceReturn: number; safeReturn: number; bufferPct: number;
  endMode: GoalUrgency; startDate: string; endDate: string; latestVwcePrice: number; latestPriceDate: string;
  contributionY1: number; contributionY2: number; disclaimerAccepted: boolean; onboardingDone: boolean;
  /** V10-A — tùy chọn, để bản ghi settings cũ vẫn hợp lệ. */
  notfallmappe?: Notfallmappe;
  createdAt: string; updatedAt: string;
};
export type Goal = {
  id: string; name: string; dueDate: string; amount: number; mode: GoalMode; baseYear: number;
  inflationRate: number; bufferPct: number; urgency: GoalUrgency; protectedAmount: number; notes: string;
  createdAt: string; updatedAt: string;
  /** A3 — xóa mềm; bản ghi tombstone vẫn giữ trong IndexedDB. */
  deletedAt?: string;
};
export type TxType = "buy_vwce" | "sell_vwce" | "cash_in" | "cash_out" | "tax" | "fee" | "safe_interest" | "adjust";
export type Transaction = {
  id: string; date: string; type: TxType; amount: number; unitPrice?: number; quantity?: number;
  fee?: number; tax?: number; goalId?: string; notes: string; createdAt: string; updatedAt: string;
  /** C3 — nguồn nhập; bản cũ không có field này vẫn hợp lệ. */
  source?: "manual" | "trade_republic_pdf";
  sourceVersion?: number;
  /** C3 — khóa chống trùng, ví dụ trade_republic:<docNumber>. */
  externalRef?: string;
  /** A3 — xóa mềm; bản ghi tombstone vẫn giữ trong IndexedDB. */
  deletedAt?: string;
};
export type ChecklistItem = { key: string; label: string; done: boolean };
export type AnnualChecklist = { id: string; year: number; items: ChecklistItem[]; createdAt: string; updatedAt: string };
export type MonthlySnapshot = {
  id: string; year: number; month: number; vwceValue: number; cashValue: number; totalValue: number;
  contributed: number; withdrawn: number; createdAt: string; updatedAt: string;
};
export type AppMetadata = { id: string; schemaVersion: number; lastBackupAt: string; createdAt: string; updatedAt: string };
export type BackupPayload = {
  schemaVersion: number; exportedAt: string; settings: AppSettings[]; goals: Goal[];
  transactions: Transaction[]; annualChecklists: AnnualChecklist[]; monthlySnapshots: MonthlySnapshot[];
};
export const SCHEMA_VERSION = 1;
/** Hiển thị ở Cài đặt — đổi khi ship UI lớn */
export const APP_VERSION = "1.6.0";
