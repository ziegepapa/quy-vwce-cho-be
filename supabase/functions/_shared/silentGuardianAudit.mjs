// Pure, read-only structural audit of the server snapshot.
// Never infer local Dexie state, pending outbox, broker balances or missing deposits.
export const TRANSACTION_TYPES = new Set([
  "buy_vwce", "sell_vwce", "buy_security", "sell_security",
  "cash_in", "cash_out", "tax", "fee", "safe_interest", "adjust",
]);
const DOMAINS = ["transactions", "goals", "app_settings"];

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validDate(value) {
  if (typeof value !== "string" || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)) return false;
  const time = Date.parse(value + "T00:00:00Z");
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

export function auditGuardianSnapshot(datasets, { pageLimit = 1000 } = {}) {
  const checks = {};
  let findings = 0;
  let incomplete = false;

  for (const domain of DOMAINS) {
    const rows = datasets?.[domain];
    if (!Array.isArray(rows)) throw new TypeError("Missing domain: " + domain);
    if (rows.length >= pageLimit) incomplete = true;

    // Tombstones are sync evidence, not live holdings. Never treat them as corruption.
    const active = rows.filter((r) => r?.deleted_at == null);
    const issues = { mismatchedIds: 0, invalidAmount: 0, invalidType: 0, invalidDate: 0 };
    for (const row of active) {
      if (!isRecord(row?.data) || typeof row.id !== "string" || row.id !== row.data.id) {
        issues.mismatchedIds++;
      }
      if (!isRecord(row?.data)) continue;
      if (domain !== "app_settings" && (typeof row.data.amount !== "number" || !Number.isFinite(row.data.amount))) {
        issues.invalidAmount++;
      }
      if (domain === "transactions") {
        if (!TRANSACTION_TYPES.has(row.data.type)) issues.invalidType++;
        if (!validDate(row.data.date)) issues.invalidDate++;
      }
    }
    findings += Object.values(issues).reduce((sum, value) => sum + value, 0);
    checks[domain] = { active: active.length, tombstones: rows.length - active.length, issues };
  }

  return {
    status: incomplete ? "incomplete" : findings > 0 ? "review" : "pass_basic_checks",
    checks,
    limitations: [
      "Server-side rows only; local Dexie and pending outbox are not visible",
      "Basic structural checks only; not a financial or sync completeness audit",
      ...(incomplete ? ["At least one domain reached the row cap; review is incomplete"] : []),
    ],
  };
}
