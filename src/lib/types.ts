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

/**
 * Multi-asset foundation — instrument keyed by normalized ISIN.
 * Ticker is optional metadata; ISIN is the primary key.
 */
export type Instrument = {
  /** Normalized uppercase ISIN (primary key). */
  isin: string;
  name: string;
  /** Optional display/provider ticker — never required for ledger. */
  ticker?: string;
  currency: string;
  venue?: string;
  /** Explicit provider symbol map, e.g. { yahoo: "VWCE.DE" }. */
  providerSymbols?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
};

/** Candidate source kind — manual and auto coexist without overwrite. */
export type QuoteSourceKind = "manual" | "auto";

/**
 * Raw quote candidate — one row per (ISIN, currency, source).
 * Never overwritten across sources. Local-only (not in EntityTable/outbox).
 */
export type QuoteCandidate = {
  id: string; // qc_<ISIN>_<CCY>_<manual|auto>
  instrumentIsin: string;
  currency: string;
  source: QuoteSourceKind;
  price: number; // > 0 finite
  asOf: string; // YYYY-MM-DD calendar date
  venue?: string;
  provider?: string;
  providerUrl?: string;
  crossCheckedWith?: string;
  crossCheckDifferencePct?: number;
  /** Wall-clock ISO; metadata only — never economics key. */
  fetchedAt?: string;
  createdAt: string;
  updatedAt: string;
};

/** User preference: auto (default) or explicit manual override. */
export type QuotePreferenceMode = "auto" | "manual";

/**
 * Preference per (ISIN, currency). Absent row ≡ mode auto.
 * Local-only (not in EntityTable/outbox).
 */
export type QuoteSelectionPreference = {
  id: string; // pref_<ISIN>_<CCY>
  instrumentIsin: string;
  currency: string;
  mode: QuotePreferenceMode;
  createdAt: string;
  updatedAt: string;
};

/**
 * Effective/materialized quote for one ISIN+currency.
 * Derived cache of the winning candidate; UI/calc read this table only.
 * id = quote_<ISIN>_<CCY> (unchanged from pre-2B).
 */
export type Quote = {
  id: string;
  instrumentIsin: string;
  currency: string;
  venue?: string;
  price: number;
  asOf: string;
  source: "manual" | "auto";
  provider?: string;
  providerUrl?: string;
  crossCheckedWith?: string;
  crossCheckDifferencePct?: number;
  fetchedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type AppSettings = {
  id: string; planName: string; childName: string; accountType: "child" | "parent";
  currency: "EUR"; inflationRate: number; vwceReturn: number; safeReturn: number; bufferPct: number;
  endMode: GoalUrgency; startDate: string; endDate: string;
  /**
   * @deprecated Prefer Quote table keyed by ISIN. Kept for backup/UI backward compat;
   * migrate to manual quote for IE00BK5BQT80 on load.
   */
  latestVwcePrice: number;
  /** @deprecated Prefer Quote.asOf for IE00BK5BQT80. */
  latestPriceDate: string;
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

/**
 * Transaction types.
 * - buy_vwce / sell_vwce: legacy aliases; imply VWCE when instrumentIsin missing.
 * - buy_security / sell_security: generic multi-asset; require instrumentIsin.
 */
export type TxType =
  | "buy_vwce"
  | "sell_vwce"
  | "buy_security"
  | "sell_security"
  | "cash_in"
  | "cash_out"
  | "tax"
  | "fee"
  | "safe_interest"
  | "adjust";

export type Transaction = {
  id: string; date: string; type: TxType; amount: number; unitPrice?: number; quantity?: number;
  fee?: number; tax?: number; goalId?: string; notes: string; createdAt: string; updatedAt: string;
  /**
   * ISIN of the security for buy/sell. Legacy rows without this field are
   * treated as IE00BK5BQT80 (VWCE) by resolveInstrumentIsin().
   */
  instrumentIsin?: string;
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
  /** Multi-asset foundation — optional on legacy backups. */
  instruments?: Instrument[];
  /**
   * Effective quotes — in BACKUP_SCHEMA_VERSION 3 this is a non-authoritative
   * diagnostic snapshot only. Import always recomputes from candidates+preferences.
   */
  quotes?: Quote[];
  /** Authoritative on v3. */
  quoteCandidates?: QuoteCandidate[];
  /** Authoritative on v3. */
  quotePreferences?: QuoteSelectionPreference[];
};

/**
 * Local backup envelope version.
 * - 1: legacy (pre multi-asset)
 * - 2: instruments + effective quotes
 * - 3: candidates + preferences authoritative; quotes derived
 */
export const BACKUP_SCHEMA_VERSION = 3;
/** @deprecated Use BACKUP_SCHEMA_VERSION for export; kept as alias for older imports. */
export const SCHEMA_VERSION = BACKUP_SCHEMA_VERSION;

/**
 * IndexedDB Dexie schema version (forward-only).
 * v4 adds quoteCandidates + quotePreferences empty stores; data migration is app-level.
 * Emergency/revert builds that ship after any client has opened v4 MUST still declare 4.
 */
export const DEXIE_DB_VERSION = 4;

/** Calendar-day stale threshold for auto candidates (economics asOf, not fetchedAt). */
export const STALE_DAYS = 7;

/**
 * Migration marker for app-level candidate seed after Dexie v4 open.
 * Stored in appMetadata id = "quoteMigration".
 */
export type QuoteMigrationState = "pending" | "complete" | "failed";

export type QuoteMigrationMeta = {
  id: "quoteMigration";
  state: QuoteMigrationState;
  updatedAt: string;
  lastError?: string;
};

/** Hiển thị ở Cài đặt — đổi khi ship UI lớn */
export const APP_VERSION = "1.7.0";

/** Canonical VWCE ISIN used for legacy migration. */
export const VWCE_ISIN = "IE00BK5BQT80";
