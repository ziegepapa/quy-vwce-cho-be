import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const overviewCss = readFileSync(new URL("./demo-v10-overview.css", import.meta.url), "utf8");
const settingsCss = readFileSync(new URL("./demo-v10-settings.css", import.meta.url), "utf8");
const overviewBan2Css = readFileSync(new URL("./overview-ban2.css", import.meta.url), "utf8");

describe("demo v10 visual regression contracts", () => {
  it("keeps the redesigned Overview attached to the active app theme", () => {
    expect(overviewBan2Css).toContain("background:var(--bg-base)");
    expect(overviewBan2Css).toContain("color:var(--text-primary)");
    expect(overviewBan2Css).toContain("background:var(--command-card-bg,var(--surface-raised))");
    expect(overviewBan2Css).toContain("var(--primary-600)");
    expect(overviewBan2Css).toContain("var(--success-600)");
    expect(overviewBan2Css).not.toMatch(/#[0-9a-f]{3,8}\\b/i);
  });

  it("aligns Overview desktop card rows and gives mobile a deliberate single-column order", () => {
    expect(overviewBan2Css).toContain('"hero mile" "mid journey" "table updates" "attention foot"');
    expect(overviewBan2Css).toContain('@media (max-width:1023px)');
    expect(overviewBan2Css).toContain('grid-template-areas:"hero" "mile" "chart" "donut" "table" "updates" "journey" "attention" "foot"');
    expect(overviewBan2Css).toContain(".ovb2-main,.ovb2-side,.ovb2-mid {display:contents}");
  });
  it("inherits the demo theme palette and changes every performance visual by data state", () => {
    expect(overviewCss).toContain("--perf-contribution: var(--demo-vi)");
    expect(overviewCss).toContain("--perf-gain: var(--demo-em)");
    expect(overviewCss).toContain("--perf-loss: var(--demo-re)");
    expect(overviewCss).toContain(".ov .perf-return.gain { color: var(--perf-gain); }");
    expect(overviewCss).toContain(".ov .perf-return.loss { color: var(--perf-loss); }");
    expect(overviewCss).toContain(".ov .perf-bar-base, .ov .perf-bar-gain, .ov .perf-bar-loss");
    expect(overviewCss).toContain(".ov .perf-bar-loss { right: 0;");
    expect(overviewCss).toContain(".ov .pl-dot.base { background: var(--perf-contribution); }");
    expect(overviewCss).toContain(".ov .pl-dot.gain { background: var(--perf-gain); }");
    expect(overviewCss).toContain(".ov .pl-dot.loss { background: var(--perf-loss); }");
    expect(overviewCss).toContain(".ov .pp-val.base { color: var(--perf-contribution); }");
    expect(overviewCss).toContain(".ov .pp-val.gain { color: var(--perf-gain); }");
    expect(overviewCss).toContain(".ov .pp-val.loss { color: var(--perf-loss); }");
  });

  it("keeps Vault Atelier’s premium hero, distinct task clusters and reduced-motion safety", () => {
    expect(settingsCss).toContain(".set-wrap.vault-atelier");
    expect(settingsCss).toContain(".set-atelier-hero");
    expect(settingsCss).toContain(".set-atelier-sync");
    expect(settingsCss).toContain(".set-security-cluster .set-group");
    expect(settingsCss).toContain(".set-data-cluster .set-group");
    expect(settingsCss).toContain("min-height: 50px");
    expect(settingsCss).toContain("@media (prefers-reduced-motion:reduce)");
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
