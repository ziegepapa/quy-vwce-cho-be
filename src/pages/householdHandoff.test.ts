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
      readiness: { complete: 3, total: 3, planReady: true, emergencyReady: true, printedReady: true },
    });
    expect(JSON.stringify(handoff)).not.toMatch(/Mai|Home safe|Education fund|school|example/);
  });

  it("treats incomplete emergency data as incomplete readiness rather than inventing it", () => {
    const handoff = buildHouseholdHandoff({ ...base, notfallmappe: { purpose: "", custodyNote: "", contacts: [], documents: [], wishes: "" } });
    expect(handoff.emergency)
      .toEqual({ completeSections: 0, totalSections: 4, contactCount: 0, documentLocationCount: 0, lastPrintedAt: null });
    expect(handoff.readiness).toEqual({ complete: 1, total: 3, planReady: true, emergencyReady: false, printedReady: false });
  });

  it("uses a safe fallback plan name and leaves the use-date state unconfigured when optional settings are absent", () => {
    const handoff = buildHouseholdHandoff({ planName: "", childName: "", today: base.today });
    expect(handoff.planName).toBe("VWCE Vault");
    expect(handoff.childName).toBeNull();
    expect(handoff.targetUseDate).toBeNull();
    expect(handoff.planStatus).toBeNull();
    expect(handoff.yearsLeft).toBeNull();
    expect(handoff.readiness).toEqual({ complete: 0, total: 3, planReady: false, emergencyReady: false, printedReady: false });
  });

  it("keeps readiness aggregate free of emergency content even when the source has sensitive-looking values", () => {
    const handoff = buildHouseholdHandoff({
      ...base,
      notfallmappe: {
        purpose: "Do not expose account details",
        custodyNote: "Drawer 7",
        contacts: [{ name: "Sensitive Name", phone: "+49 999", email: "sensitive@example.test" }],
        documents: [{ location: "Private storage" }],
        wishes: "Private family instruction",
      },
    });
    expect(handoff.readiness).toEqual({ complete: 2, total: 3, planReady: true, emergencyReady: true, printedReady: false });
    expect(JSON.stringify(handoff)).not.toMatch(/Sensitive|Drawer|Private|example|999/);
  });
});
