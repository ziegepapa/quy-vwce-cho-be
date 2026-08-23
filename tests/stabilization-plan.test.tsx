import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("long-term stabilization contract", () => {
  it("keeps the yearly-plan contract free of annual transfer-rate controls", () => {
    const source = readFileSync(new URL("../src/components/SettingsCboWorkspace.tsx", import.meta.url), "utf8");
    expect(source).not.toContain("Preview chuyển đổi/năm");
    expect(source).not.toContain("Transfer-Vorschau/Jahr");
    expect(source).not.toContain("transferPctYear");
    expect(source).not.toContain("const [transferRate");
  });
});
