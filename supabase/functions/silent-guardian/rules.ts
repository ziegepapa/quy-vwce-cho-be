// Silent Guardian V1: verified cloud-ledger events only. No prices, projections,
// monthly guesses or broker assumptions. Browser/production finance code is untouched.
export type SyncedGuardianRow = {
  id: string;
  data: unknown;
  deleted_at?: string | null;
};

export type GuardianSignal = {
  key: string;
  kind: "recorded_sale" | "possible_duplicate_import";
};

type Trade = {
  id: string;
  type: string;
  externalRef?: string;
  source?: string;
  createdAt: string;
};

function tradeFrom(row: SyncedGuardianRow): Trade | null {
  if (row.deleted_at || !row.data || typeof row.data !== "object" || Array.isArray(row.data)) return null;
  const d = row.data as Record<string, unknown>;
  if (typeof row.id !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(row.id)) return null;
  if (typeof d.createdAt !== "string" || !Number.isFinite(Date.parse(d.createdAt))) return null;
  if (typeof d.type !== "string") return null;
  if (typeof d.amount !== "number" || !Number.isFinite(d.amount) || d.amount <= 0) return null;
  if (d.deletedAt) return null;
  return {
    id: row.id,
    type: d.type,
    createdAt: d.createdAt,
    externalRef: typeof d.externalRef === "string" ? d.externalRef.trim() : undefined,
    source: typeof d.source === "string" ? d.source : undefined,
  };
}

export function detectGuardianSignals(rows: SyncedGuardianRow[], enrolledAt: string): GuardianSignal[] {
  const enrolled = Date.parse(enrolledAt);
  if (!Number.isFinite(enrolled)) return [];
  const trades = rows.map(tradeFrom).filter((t): t is Trade => t !== null);
  const signals: GuardianSignal[] = [];
  const byRef = new Map<string, Trade[]>();

  for (const tx of trades) {
    const newAfterOptIn = Date.parse(tx.createdAt) > enrolled;
    if (newAfterOptIn && (tx.type === "sell_vwce" || tx.type === "sell_security")) {
      signals.push({ key: `sale/${tx.id}`, kind: "recorded_sale" });
    }
    // Only a documented import reference, not a coincidentally equal amount/date.
    if (tx.source === "trade_republic_pdf" && tx.externalRef && tx.externalRef.length <= 200) {
      const ref = tx.externalRef;
      const group = byRef.get(ref) ?? [];
      group.push(tx);
      byRef.set(ref, group);
    }
  }
  for (const group of byRef.values()) {
    if (group.length < 2 || !group.some((t) => Date.parse(t.createdAt) > enrolled)) continue;
    // Avoid the external broker reference in stored keys and email; a row ID is
    // sufficient as a stable deduplication key for each new duplicate.
    for (const tx of group.filter((t) => Date.parse(t.createdAt) > enrolled)) {
      signals.push({ key: `duplicate/${tx.id}`, kind: "possible_duplicate_import" });
    }
  }
  return signals.sort((a, b) => a.key.localeCompare(b.key));
}
