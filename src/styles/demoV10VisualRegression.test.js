import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const overviewCss = readFileSync(new URL("./demo-v10-overview.css", import.meta.url), "utf8");
const settingsCss = readFileSync(new URL("./demo-v10-settings.css", import.meta.url), "utf8");

describe("demo v10 visual regression contracts", () => {
  it("keeps the demo's orange contributions and yellow gains linked across the performance card", () => {
    expect(overviewCss).toContain("--perf-contribution: #f97316");
    expect(overviewCss).toContain("--perf-gain: #facc15");
    expect(overviewCss).toContain(".ov .perf-return { color: var(--perf-gain)");
    expect(overviewCss).toContain(".ov .perf-bar-base { left: 0;");
    expect(overviewCss).toContain("var(--perf-contribution)");
    expect(overviewCss).toContain(".ov .perf-bar-gain { border-radius: 0 5px 5px 0; background: linear-gradient(90deg, var(--perf-gain)");
    expect(overviewCss).toContain(".ov .pl-dot.base { background: var(--perf-contribution); }");
    expect(overviewCss).toContain(".ov .pl-dot.gain { background: var(--perf-gain); }");
    expect(overviewCss).toContain(".ov .pp-val.base { color: var(--perf-contribution); }");
    expect(overviewCss).toContain(".ov .pp-val.gain { color: var(--perf-gain); }");
  });

  it("keeps nested advanced price metadata within the card at narrow widths", () => {
    expect(settingsCss).toContain(".set-wrap .advanced-group .settings-card { padding: 16px !important; }");
    expect(settingsCss).toContain(".set-wrap .advanced-group .asset-price-list { margin: 0 -16px -16px; }");
    expect(settingsCss).toContain(".set-wrap .advanced-group .asset-price-value { flex: 0 1 46%; min-width: 0; }");
    expect(settingsCss).toContain("overflow-wrap: anywhere; word-break: break-word;");
    expect(settingsCss).toContain(".set-wrap .advanced-group .settings-card-head p:last-child { overflow-wrap: anywhere; }");
    expect(settingsCss).toContain("@media (max-width: 360px)");
  });
});
