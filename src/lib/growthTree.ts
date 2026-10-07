/**
 * Growth-tree stage logic — pure, no Date.now(), no storage.
 * The tree grows as the portfolio crosses value milestones.
 */

/** Value milestones (EUR) that feed the tree, ascending. */
export const TREE_MILESTONES = [
  1000, 2500, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000,
];

/** 0 = seed, 1 = sprout, 2 = sapling, 3 = tree, 4 = grand tree. */
export type TreeStage = 0 | 1 | 2 | 3 | 4;

export function countReachedMilestones(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return TREE_MILESTONES.filter((m) => value >= m).length;
}

export function treeStageForValue(value: number): TreeStage {
  const reached = countReachedMilestones(value);
  if (reached === 0) return 0;
  if (reached <= 2) return 1;
  if (reached <= 4) return 2;
  if (reached <= 6) return 3;
  return 4;
}

export type TreeCopy = {
  title: string;
  stageName: string;
  nextMilestone: (remaining: string, target: string) => string;
  allReached: string;
};

const COPY: Record<"vi" | "de", { title: string; stages: [string, string, string, string, string]; nextMilestone: (r: string, t: string) => string; allReached: string }> = {
  vi: {
    title: "Cây tăng trưởng",
    stages: ["Hạt giống", "Mầm non", "Cây non", "Cây xanh", "Cây cổ thụ"],
    nextMilestone: (remaining, target) => `Còn ${remaining} nữa đến mốc ${target}`,
    allReached: "Đã vượt mọi cột mốc — cây vươn tới trời xanh",
  },
  de: {
    title: "Wachstumsbaum",
    stages: ["Samen", "Keimling", "Junger Baum", "Baum", "Mächtiger Baum"],
    nextMilestone: (remaining, target) => `Noch ${remaining} bis ${target}`,
    allReached: "Alle Meilensteine erreicht — der Baum wächst in den Himmel",
  },
};

export function treeCopy(locale: "vi" | "de", stage: TreeStage): TreeCopy {
  const c = COPY[locale] ?? COPY.vi;
  return {
    title: c.title,
    stageName: c.stages[stage],
    nextMilestone: c.nextMilestone,
    allReached: c.allReached,
  };
}

export function formatTreeMoney(value: number, locale: "vi" | "de"): string {
  const rounded = Math.round(value);
  const grouped = rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${grouped} €`;
}
