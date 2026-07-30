export type GoalMode = "nominal" | "purchasing_power";
export type GoalUrgency = "hard" | "flexible";
export type AppSettings = {
  id: string; planName: string; childName: string; accountType: "child" | "parent";
  currency: "EUR"; inflationRate: number; vwceReturn: number; safeReturn: number; bufferPct: number;
  endMode: GoalUrgency; startDate: string; endDate: string; latestVwcePrice: number; latestPriceDate: string;
  contributionY1: number; contributionY2: number; disclaimerAccepted: boolean; onboardingDone: boolean;
  createdAt: string; updatedAt: string;
};
export type Goal = {
  id: string; name: string; dueDate: string; amount: number; mode: GoalMode; baseYear: number;
  inflationRate: number; bufferPct: number; urgency: GoalUrgency; protectedAmount: number; notes: string;
  createdAt: string; updatedAt: string;
};
export type TxType = "buy_vwce" | "sell_vwce" | "cash_in" | "cash_out" | "tax" | "fee" | "safe_interest" | "adjust";
export type Transaction = {
  id: string; date: string; type: TxType; amount: number; unitPrice?: number; quantity?: number;
  fee?: number; tax?: number; goalId?: string; notes: string; createdAt: string; updatedAt: string;
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
export const APP_VERSION = "1.4.0";
