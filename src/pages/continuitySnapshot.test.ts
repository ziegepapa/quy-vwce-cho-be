import { describe, expect, it } from "vitest";
import { buildHouseholdHandoff } from "./householdHandoff";
import { buildContinuitySnapshot } from "./continuitySnapshot";

describe("buildContinuitySnapshot", () => {
  it("keeps only print-safe continuity fields and excludes sensitive handoff content", () => {
    const handoff = buildHouseholdHandoff({
      planName: "VWCE für Anna",
      childName: "Anna Geheim",
      planTarget: { targetUseDate: "2040-06-01", needFullAmount: true },
      notfallmappe: {
        purpose: "Private purpose text",
        custodyNote: "Private custody note",
        contacts: [{ name: "Private contact", phone: "+49 111", email: "secret@example.invalid" }],
        documents: [{ location: "Private location" }],
        wishes: "Private wishes",
        lastPrintedAt: "2026-08-20T10:00:00.000Z",
      },
      today: new Date("2026-08-20T00:00:00.000Z"),
    });
    const snapshot = buildContinuitySnapshot({ handoff, syncStatus: "synced", pending: -3 });

    expect(snapshot).toEqual({
      planName: "VWCE für Anna",
      targetUseDate: "2040-06-01",
      yearsLeft: expect.any(Number),
      readiness: { complete: 3, total: 3 },
      sync: { status: "synced", pending: 0 },
    });
    expect(JSON.stringify(snapshot)).not.toContain("Anna Geheim");
    expect(JSON.stringify(snapshot)).not.toContain("Private contact");
    expect(JSON.stringify(snapshot)).not.toContain("Private location");
    expect(JSON.stringify(snapshot)).not.toContain("Private wishes");
    expect(JSON.stringify(snapshot)).not.toContain("secret@example.invalid");
  });

  it("does not invent plan or readiness values when source data is incomplete", () => {
    const handoff = buildHouseholdHandoff({
      planName: "",
      childName: "",
      notfallmappe: { purpose: "", custodyNote: "", contacts: [], documents: [], wishes: "" },
      today: new Date("2026-08-20T00:00:00.000Z"),
    });
    const snapshot = buildContinuitySnapshot({ handoff, syncStatus: "offline", pending: 2.8 });

    expect(snapshot.planName).toBe("VWCE Vault");
    expect(snapshot.targetUseDate).toBeNull();
    expect("planStatus" in snapshot).toBe(false);
    expect(snapshot.yearsLeft).toBeNull();
    expect(snapshot.readiness).toEqual({ complete: 0, total: 3 });
    expect(snapshot.sync).toEqual({ status: "offline", pending: 2 });
  });
});
