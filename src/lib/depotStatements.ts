import type { DepotStatement } from "./types";
import { nowIso } from "./defaults";
import { getSettings, saveSettings } from "./db.m07b";

function allStatements(value: DepotStatement[] | undefined): DepotStatement[] {
  return Array.isArray(value) ? value : [];
}

export async function listDepotStatements(): Promise<DepotStatement[]> {
  const settings = await getSettings();
  return allStatements(settings.depotStatements)
    .filter((statement) => !statement.deletedAt)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export async function findDepotStatementByStatementId(
  statementId: string,
): Promise<DepotStatement | undefined> {
  const normalized = statementId.trim();
  if (!normalized) return undefined;
  return (await listDepotStatements()).find((statement) => statement.statementId === normalized);
}

export async function saveDepotStatement(
  statement: DepotStatement,
  opts?: { sync?: boolean },
): Promise<void> {
  const statementId = statement.statementId.trim();
  if (!statementId) throw new Error("Sao kê thiếu statementId.");
  if (!statement.positions.length) throw new Error("Sao kê không có position.");
  if (await findDepotStatementByStatementId(statementId)) {
    throw new Error("Sao kê này đã được nhập trước đó.");
  }
  const settings = await getSettings();
  const t = nowIso();
  const next: DepotStatement = {
    ...statement,
    statementId,
    createdAt: statement.createdAt || t,
    updatedAt: t,
    deletedAt: undefined,
  };
  await saveSettings(
    { depotStatements: [...allStatements(settings.depotStatements), next] },
    opts,
  );
}

/** Reversible deletion: keep a tombstone inside synced settings. */
export async function deleteDepotStatement(
  id: string,
  opts?: { sync?: boolean },
): Promise<void> {
  const settings = await getSettings();
  const rows = allStatements(settings.depotStatements);
  const existing = rows.find((statement) => statement.id === id && !statement.deletedAt);
  if (!existing) return;
  const t = nowIso();
  await saveSettings(
    {
      depotStatements: rows.map((statement) =>
        statement.id === id ? { ...statement, deletedAt: t, updatedAt: t } : statement,
      ),
    },
    opts,
  );
}
