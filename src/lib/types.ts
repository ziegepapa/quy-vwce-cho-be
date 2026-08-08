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

/** Multi-asset foundation — instrument keyed by normalized ISIN. */
export type Instrument = {
  isin: string;
  name: string;
  ticker?: string;
  currency: string;
  venue?: string;
  providerSymbols?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
};

export type QuoteSourceKind = "manual" | "auto";

export type QuoteCandidate = {
  id: string;
  instrumentIsin: string;
  currency: string;
  source: QuoteSourceKind;
  price: number;
  asOf: string;
  venue?: string;
  provider?: string;
  providerUrl?: string;
  crossCheckedWith?: string;
  crossCheckDifferencePct?: number;
  fetchedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type QuotePreferenceMode = "auto" | "manual";

export type QuoteSelectionPreference = {
  id: string;
  instrumentIsin: string;
  currency: string;
  mode: QuotePreferenceMode;
  createdAt: string;
  updatedAt: string;
};

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

/** One security position read from a broker depot statement. */
export type DepotPosition = {
  instrumentIsin: string;
  name?: string;
  quantity: number;
  unitPrice?: number;
  marketValue?: number;
  currency: string;
};

/**
 * Read-only broker snapshot. It is evidence for reconciliation and never a
 * source of synthetic buy/sell transactions.
 */
export type DepotStatement = {
  id: string;
  statementId: string;
  date: string;
  accountRef?: string;
  broker: "trade_republic";
  positions: DepotPosition[];
  source: "trade_republic_pdf";
  sourceVersion: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
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
  notfallmappe?: Notfallmappe;
  /** V10-C — nested to inherit settings backup/sync without a remote schema change. */
  depotStatements?: DepotStatement[];
  /**
   * CASH-MODEL-OPTIONAL-001 r1 — how the money that paid for a purchase is
   * tracked.
   *
   * false (default): securities-first. The euros left a bank or broker account
   * this app never sees, so a buy without a matching `cash_in` is not a missing
   * deposit and must not be reported as one.
   * true: the full double-entry ledger, where a buy really does need its
   * funding entry and the gap is worth naming.
   *
   * Optional on purpose. Settings rows written before this field existed, and
   * every backup file already on disk, load unchanged and read as false. That
   * is why neither DEXIE_DB_VERSION nor BACKUP_SCHEMA_VERSION moves.
   */
  trackInAppCash?: boolean;
  createdAt: string; updatedAt: string;
};
export type Goal = {
  id: string; name: string; dueDate: string; amount: number; mode: GoalMode; baseYear: number;
  inflationRate: number; bufferPct: number; urgency: GoalUrgency; protectedAmount: number; notes: string;
  createdAt: string; updatedAt: string;
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
  instrumentIsin?: string;
  source?: "manual" | "trade_republic_pdf";
  sourceVersion?: number;
  externalRef?: string;
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
  instruments?: Instrument[];
  quotes?: Quote[];
  quoteCandidates?: QuoteCandidate[];
  quotePreferences?: QuoteSelectionPreference[];
};

export const BACKUP_SCHEMA_VERSION = 3;
export const SCHEMA_VERSION = BACKUP_SCHEMA_VERSION;

/** IndexedDB version remains 4; depot snapshots ride inside synced settings. */
export const DEXIE_DB_VERSION = 4;
export const STALE_DAYS = 7;

export type QuoteMigrationState = "pending" | "complete" | "failed";

export type QuoteMigrationMeta = {
  id: "quoteMigration";
  state: QuoteMigrationState;
  updatedAt: string;
  lastError?: string;
};

/** Hiển thị ở Cài đặt — đổi khi ship UI lớn */
export const APP_VERSION = "1.8.0";

export const VWCE_ISIN = "IE00BK5BQT80";
