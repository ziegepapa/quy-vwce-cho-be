import { describe, expect, it } from "vitest";
import { buildHouseholdHandoff } from "./householdHandoff";

const base = {
  planName: "Quỹ cho bé",
  childName: "An",
  planTarget: { targetUseDate: "2042-06-30", needFullAmount: true },
  today: new Date("2026-08-20T12:00:00"),
};

describe("buildHouseholdHandoff", () => {
  it("summarizes readiness without returning contacts, locations or free-text wishes", () => {
    const handoff = buildHouseholdHandoff({
      ...base,
      notfallmappe: {
        purpose: "Education fund",
        custodyNote: "Folder A",
        contacts: [{ name: "Mai", phone: "+49 111", email: "mai@example.test" }],
        documents: [{ location: "Home safe" }, { location: "" }],
        wishes: "Use for school",
        lastPrintedAt: "2026-08-01T12:00:00.000Z",
      },
    });
    expect(handoff).toMatchObject({
      planName: "Quỹ cho bé",
      childName: "An",
      targetUseDate: "2042-06-30",
      emergency: { completeSections: 4, totalSections: 4, contactCount: 1, documentLocationCount: 1, lastPrintedAt: "2026-08-01T12:00:00.000Z" },
    });
    expect(JSON.stringify(handoff)).not.toMatch(/Mai|Home safe|Education fund|school|example/);
  });

  it("treats incomplete emergency data as an incomplete summary rather than inventing it", () => {
    expect(buildHouseholdHandoff({ ...base, notfallmappe: { purpose: "", custodyNote: "", contacts: [], documents: [], wishes: "" } }).emergency)
      .toEqual({ completeSections: 0, totalSections: 4, contactCount: 0, documentLocationCount: 0, lastPrintedAt: null });
  });

  it("uses a safe fallback plan name and leaves the use-date state unconfigured when optional settings are absent", () => {
    const handoff = buildHouseholdHandoff({ planName: "", childName: "", today: base.today });
    expect(handoff.planName).toBe("VWCE Vault");
    expect(handoff.childName).toBeNull();
    expect(handoff.targetUseDate).toBeNull();
    expect(handoff.planStatus).toBeNull();
    expect(handoff.yearsLeft).toBeNull();
  });
});
