import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { defaultSettings } from "./defaults";
import {
  deleteDepotStatement,
  findDepotStatementByStatementId,
  listDepotStatements,
  saveDepotStatement,
} from "./depotStatements";
import type { DepotStatement } from "./types";

const statement: DepotStatement = {
  id: "depot_1",
  statementId: "DEPOT-2026-07",
  date: "2026-07-31",
  broker: "trade_republic",
  source: "trade_republic_pdf",
  sourceVersion: 1,
  positions: [
    {
      instrumentIsin: "IE00BK5BQT80",
      quantity: 10.5,
      unitPrice: 167.54,
      marketValue: 1759.17,
      currency: "EUR",
    },
  ],
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

beforeEach(async () => {
  await db.delete();
  await db.open();
  await db.settings.put(defaultSettings());
});

describe("depot statement settings storage", () => {
  it("saves, lists and deduplicates by statementId", async () => {
    await saveDepotStatement(statement, { sync: false });
    expect(await listDepotStatements()).toHaveLength(1);
    expect((await findDepotStatementByStatementId(statement.statementId))?.id).toBe("depot_1");
    await expect(
      saveDepotStatement({ ...statement, id: "depot_2" }, { sync: false }),
    ).rejects.toThrow(/đã được nhập/);
  });

  it("soft deletes while retaining a tombstone for sync/backup", async () => {
    await saveDepotStatement(statement, { sync: false });
    await deleteDepotStatement(statement.id, { sync: false });
    expect(await listDepotStatements()).toEqual([]);
    const settings = await db.settings.get("settings");
    expect(settings?.depotStatements?.[0].deletedAt).toBeTruthy();
  });
});
