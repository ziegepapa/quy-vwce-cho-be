import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

const contracts = [
  {
    path: "src/pages/Simulation.tsx",
    forbidden: [
      /estimateGermanExitTax/,
      /\btaxOn\b/,
      /\bshowAfterTax\b/,
      /afterTax/,
      /DE-Steuern/,
      /German tax/i,
    ],
  },
  {
    path: "src/components/demo-v10/SimulationDemoShell.tsx",
    forbidden: [
      /\btaxOn\b/,
      /\bshowAfterTax\b/,
      /germanTax/,
      /afterTax/,
      /DE-Steuern/,
      /Thuế DE/,
    ],
  },
  {
    path: "src/components/PlanRoadmapSection.tsx",
    forbidden: [
      /getPlanPhase/,
      /PlanPhase/,
      /equityPct/,
      /Aktienziel/,
      /Mục tiêu cổ phiếu/,
      /Lộ trình giảm rủi ro/,
      /Giai đoạn tăng trưởng/,
      /Dừng góp cổ phiếu/,
    ],
  },
  {
    path: "src/pages/householdHandoff.ts",
    forbidden: [/getPlanPhase/, /planStatus/, /equityPct/],
  },
  {
    path: "src/pages/continuitySnapshot.ts",
    forbidden: [/planStatus/],
  },
  {
    path: "src/pages/printContinuitySnapshot.ts",
    forbidden: [/planStatus/],
  },
];

const violations = [];
for (const contract of contracts) {
  const source = await readFile(resolve(root, contract.path), "utf8");
  for (const pattern of contract.forbidden) {
    if (pattern.test(source)) violations.push(`${contract.path}: ${pattern}`);
  }
}

assert.deepEqual(
  violations,
  [],
  `H0.1 policy boundary violated by production-facing source: ${violations.join(", ")}`,
);

console.log("Financial-policy boundary OK: production UI exposes no tax result/toggle or prescriptive glide-path surface.");
