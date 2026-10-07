import { describe, expect, it } from "vitest";
import {
  countReachedMilestones,
  formatTreeMoney,
  treeCopy,
  treeStageForValue,
  TREE_MILESTONES,
} from "./growthTree";

describe("growthTree", () => {
  it("counts reached milestones", () => {
    expect(countReachedMilestones(0)).toBe(0);
    expect(countReachedMilestones(999)).toBe(0);
    expect(countReachedMilestones(1000)).toBe(1);
    expect(countReachedMilestones(3000)).toBe(2);
    expect(countReachedMilestones(2_000_000)).toBe(TREE_MILESTONES.length);
    expect(countReachedMilestones(NaN)).toBe(0);
    expect(countReachedMilestones(-5)).toBe(0);
  });

  it("maps value to growth stage", () => {
    expect(treeStageForValue(0)).toBe(0);
    expect(treeStageForValue(500)).toBe(0);
    expect(treeStageForValue(1000)).toBe(1);
    expect(treeStageForValue(2500)).toBe(1);
    expect(treeStageForValue(5000)).toBe(2);
    expect(treeStageForValue(10000)).toBe(2);
    expect(treeStageForValue(25000)).toBe(3);
    expect(treeStageForValue(50000)).toBe(3);
    expect(treeStageForValue(100000)).toBe(4);
    expect(treeStageForValue(1000000)).toBe(4);
  });

  it("returns locale copy per stage", () => {
    expect(treeCopy("vi", 0).stageName).toBe("Hạt giống");
    expect(treeCopy("vi", 4).stageName).toBe("Cây cổ thụ");
    expect(treeCopy("de", 0).stageName).toBe("Samen");
    expect(treeCopy("de", 4).stageName).toBe("Mächtiger Baum");
    expect(treeCopy("vi", 2).nextMilestone("1.000 €", "5.000 €")).toContain("1.000 €");
  });

  it("formats money with dot grouping", () => {
    expect(formatTreeMoney(1500, "vi")).toBe("1.500 €");
    expect(formatTreeMoney(1500, "de")).toBe("1.500 €");
  });
});
