import { describe, expect, it } from "vitest";

describe("long-term stabilization contract", () => {
  it("keeps the yearly-plan contract free of annual transfer-rate controls", async () => {
    const source = await import("../src/components/SettingsCboWorkspace?raw");
    expect(source.default).not.toContain("Preview chuyển đổi/năm");
    expect(source.default).not.toContain("Transfer-Vorschau/Jahr");
    expect(source.default).not.toContain("transferPctYear");
    expect(source.default).not.toContain("const [transferRate");
  });
});
