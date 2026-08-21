import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolve } from "node:path";

const css = readFileSync(resolve("src/styles/demo-v10-transactions.css"), "utf8");
const dock = readFileSync(resolve("src/styles/dock.css"), "utf8");
const tokens = readFileSync(resolve("src/styles/tokens.css"), "utf8");
const tx = readFileSync(resolve("src/pages/Transactions.tsx"), "utf8");
const overview = readFileSync(resolve("src/components/demo-v10/OverviewFrame.tsx"), "utf8");

describe("tx filter sheet safe-area regression", () => {
  it("renders the filter sheet above the bottom dock z-index", () => {
    expect(tokens).toMatch(/--z-dock:\s*40/);
    expect(tokens).toMatch(/--z-sheet:\s*80/);
    expect(css).toMatch(/\.tx-filter-backdrop\s*\{[^}]*z-index:\s*var\(--z-sheet/);
  });
  it("keeps footer actions sticky and reachable above the home indicator", () => {
    expect(css).toMatch(/\.tx-filter-actions\s*\{[^}]*position:\s*sticky/);
    expect(css).toMatch(/safe-area-inset-bottom/);
    expect(css).toMatch(/\.tx-filter-sheet-body\s*\{[^}]*overflow-y:\s*auto/);
    expect(tx).toMatch(/data-testid="tx-filter-actions"/);
  });
  it("hides the bottom navigation while the filter sheet is open", () => {
    expect(tx).toMatch(/tx-filter-open/);
    expect(tx).toMatch(/classList\.add\("is-hidden"\)/);
    expect(dock).toMatch(/\.bottom-dock\.is-hidden/);
  });
  it("does not leave the sheet under the dock height", () => {
    expect(css).toMatch(/max-height:\s*min\(86dvh/);
  });
});

describe("data review exact wording contract", () => {
  it("uses precise missing-notes copy instead of generic data-problem wording", () => {
    expect(overview).toMatch(/ghi chú còn thiếu/);
    expect(overview).toMatch(/Giá gần nhất/);
    expect(overview).not.toMatch(/Snapshot giá/);
  });
});
