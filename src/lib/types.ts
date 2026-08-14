export type GoalMode = "nominal" | "purchasing_power";
export type GoalUrgency = "hard" | "flexible";

/** V10-A -- mot nguoi can duoc bao tin trong tinh huong khan cap. */
export type EmergencyContact = {
  id: string;
  name: string;
  relation: string;
  phone: string;
  email: string;
};

/**
 * V10-A -- NOI CAT mot giay to goc. Khong bao gio la ban chup giay to,
 * va tuyet doi khong chua mat khau, PIN hay TAN.
 */
export type DocumentLocation = {
  id: string;
  label: string;
  location: string;
};

/**
 * V10-A -- Ho so khan cap.
 *
 * Luu ben trong AppSettings chu khong phai bang rieng, de thua huong san
 * co che dong bo va sao luu cua settings ma khong phai nang phien ban Dexie.
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
  /** V10-A2 -- lan in gan nhat. Ban in giay moi la ban nguoi than dung duoc. */
  lastPrintedAt?: string;
  updatedAt: string;
};

/** Multi-asset foundation -- instrument keyed by normalized ISIN. */
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

/** Trang thai ke hoach dau tu theo so nam con lai den ngay can tien. */
export type PlanStatus = "GIỮ" | "GIẢM" | "DỪNG" | "SỬ DỤNG";

/**
 * PLAN-GLIDE-PATH-001 -- thong tin ve moc su dung tien.
 * Luu trong AppSettings de thua huong co che sync/backup ma khong can nang DB version.
 */
export type PlanTarget = {
  /** ISO date, vi du "2042-01-01" */
  targetUseDate: string;
  /** true = can gan nhu toan bo so tien */
  needFullAmount: boolean;
  /** Neu chi can mot phan (euro, tuy chon) */
  partialNeedEuro?: number;
  /** Nam da hien reminder lan cuoi -- tranh spam */
  lastGlideReminderYear?: number;
};

/** Ket qua tinh toan phase hien tai cho UI -- chi huong dan, khong lenh giao dich. */
export type PlanPhase = {
  status: PlanStatus;
  yearsLeft: number;
  equityPct: number;
  title: string;
  summary: string;
  actions: string[];
  showReminder: boolean;
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
  /** V10-C -- nested to inherit settings backup/sync without a remote schema change. */
  depotStatements?: DepotStatement[];
  /**
   * CASH-MODEL-OPTIONAL-001 r1 -- how the money that paid for a purchase is
   * tracked.
   *
   * false (default): securities-first. The euros left a bank or broker account
   * this app never sees, so a buy without a matching cash_in is not a missing
   * deposit and must not be reported as one.
   * true: the full double-entry ledger, where a buy really does need its
   * funding entry and the gap is worth naming.
   *
   * Optional on purpose. Settings rows written before this field existed, and
   * every backup file already on disk, load unchanged and read as false. That
   * is why neither DEXIE_DB_VERSION nor BACKUP_SCHEMA_VERSION moves.
   */
  trackInAppCash?: boolean;
  /** PLAN-GLIDE-PATH-001 -- lo trinh giam rui ro theo nam. Optional de tuong thich nguoc. */
  planTarget?: PlanTarget;
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
  /** DELETE-TOMBSTONE-BACKUP-001-b (v4): soft-deleted rows carried across backups. */
  deletedGoals?: Goal[];
  deletedTransactions?: Transaction[];
};

export const BACKUP_SCHEMA_VERSION = 4;
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

/** Hien thi o Cai dat -- doi khi ship UI lon */
export const APP_VERSION = "1.8.0";

export const VWCE_ISIN = "IE00BK5BQT80";
