import type { AnnualChecklist, AppSettings, Goal, Notfallmappe } from "./types";
export const ETF = { name: "Vanguard FTSE All-World UCITS ETF (USD) Accumulating", ticker: "VWCE", isin: "IE00BK5BQT80", type: "Accumulating" as const };
export function nowIso(): string { return new Date().toISOString(); }
export function uid(prefix = "id"): string { return `${prefix}_${crypto.randomUUID()}`; }

/**
 * V10-A — khung hồ sơ khẩn cấp.
 *
 * Bốn dòng giấy tờ được tạo sẵn vì đó là bốn thứ người thân thực sự phải đi tìm
 * ở Đức. Ô "nơi cất" để trống — chính việc nó trống là lời nhắc.
 */
export function defaultNotfallmappe(): Notfallmappe {
  return {
    purpose: "",
    custodyNote: "",
    brokerName: "Trade Republic",
    brokerAccountType: "",
    isin: ETF.isin,
    cashBankName: "",
    cashAccountNote: "",
    contacts: [],
    documents: [
      { id: uid("doc"), label: "Vorsorgevollmacht", location: "" },
      { id: uid("doc"), label: "Patientenverfügung", location: "" },
      { id: uid("doc"), label: "Testament", location: "" },
      { id: uid("doc"), label: "Giấy khai sinh của bé", location: "" },
    ],
    wishes: "",
    updatedAt: nowIso(),
  };
}

export function defaultSettings(): AppSettings {
  const t = nowIso();
  return { id: "settings", planName: "Quỹ VWCE cho bé", childName: "", accountType: "parent", currency: "EUR", inflationRate: 0.02, vwceReturn: 0.05, safeReturn: 0.015, bufferPct: 0.1, endMode: "hard", startDate: "2026-07-01", endDate: "2042-06-30", latestVwcePrice: 0, latestPriceDate: "", contributionY1: 100, contributionY2: 120, disclaimerAccepted: false, onboardingDone: false, notfallmappe: defaultNotfallmappe(), createdAt: t, updatedAt: t };
}
export function defaultGoals(): Goal[] {
  const t = nowIso();
  return [
    { id: uid("goal"), name: "Mục tiêu 06/2038", dueDate: "2038-06-30", amount: 10000, mode: "purchasing_power", baseYear: 2026, inflationRate: 0.02, bufferPct: 0.1, urgency: "hard", protectedAmount: 0, notes: "", createdAt: t, updatedAt: t },
    { id: uid("goal"), name: "Mục tiêu 06/2039", dueDate: "2039-06-30", amount: 2000, mode: "purchasing_power", baseYear: 2026, inflationRate: 0.02, bufferPct: 0.1, urgency: "hard", protectedAmount: 0, notes: "", createdAt: t, updatedAt: t },
    { id: uid("goal"), name: "Mục tiêu cuối 06/2042", dueDate: "2042-06-30", amount: 0, mode: "nominal", baseYear: 2026, inflationRate: 0.02, bufferPct: 0.1, urgency: "hard", protectedAmount: 0, notes: "Hạn cứng mặc định", createdAt: t, updatedAt: t },
  ];
}
export const CHECKLIST_LABELS = [
  { key: "emergency_fund", label: "Quỹ dự phòng còn đủ" },
  { key: "no_debt", label: "Không có Dispokredit hoặc nợ tiêu dùng lãi cao" },
  { key: "goals_ok", label: "Ngày và số tiền mục tiêu còn chính xác" },
  { key: "inflation_updated", label: "Đã cập nhật mục tiêu theo lạm phát" },
  { key: "cash_bucket", label: "Cash bucket trong 36 tháng tới đủ tiến độ" },
  { key: "sparplan", label: "Sparplan còn phù hợp" },
  { key: "freistellung", label: "Freistellungsauftrag đã được kiểm tra" },
  { key: "vorab", label: "Có cash cho Vorabpauschale" },
  { key: "broker_fees", label: "Phí và điều kiện broker đã được kiểm tra" },
  { key: "backup", label: "Đã xuất bản sao lưu" },
  { key: "notfallmappe", label: "Hồ sơ khẩn cấp đã được rà lại và in ra giấy" },
];
export function defaultChecklist(year: number): AnnualChecklist {
  const t = nowIso();
  return { id: `checklist_${year}`, year, items: CHECKLIST_LABELS.map((c) => ({ ...c, done: false })), createdAt: t, updatedAt: t };
}
