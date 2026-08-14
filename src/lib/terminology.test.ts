import { describe, expect, it } from "vitest";
import { CHECKLIST_LABELS } from "./defaults";
import { getPlanPhase } from "./planPhase";

function phaseCopy(targetUseDate: string): string {
  const phase = getPlanPhase(
    { targetUseDate, needFullAmount: true },
    new Date(2026, 0, 1, 12),
  );
  return [phase?.summary, ...(phase?.actions ?? [])].join(" ");
}

describe("Vietnamese user-facing terminology", () => {
  it("uses one Vietnamese term for recurring contributions across plan phases", () => {
    const copy = [phaseCopy("2036-01-01"), phaseCopy("2031-01-01"), phaseCopy("2027-01-01")].join(" ");

    expect(copy.includes("Sparplan")).toBe(false);
    expect(copy.includes("Savings Plan")).toBe(false);
    expect(copy.includes("money-market")).toBe(false);
    expect(copy.includes("kế hoạch góp định kỳ")).toBe(true);
  });

  it("uses Vietnamese-first labels in the annual checklist", () => {
    const labels = CHECKLIST_LABELS.map((item) => item.label).join(" ");

    expect(labels.includes("Cash bucket")).toBe(false);
    expect(labels.includes("Sparplan")).toBe(false);
    expect(labels.includes("Có cash")).toBe(false);
    expect(labels.includes("Phần tiền an toàn")).toBe(true);
    expect(labels.includes("Kế hoạch góp định kỳ")).toBe(true);
  });
});
