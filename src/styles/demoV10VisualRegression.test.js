import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const overviewCss = readFileSync(new URL("./demo-v10-overview.css", import.meta.url), "utf8");
const settingsCss = readFileSync(new URL("./demo-v10-settings.css", import.meta.url), "utf8");
const overviewBan2Css = readFileSync(new URL("./overview-ban2.css", import.meta.url), "utf8");
const transactionsCss = readFileSync(new URL("./transactions-v2.css", import.meta.url), "utf8");
const shellCss = readFileSync(new URL("./visual-abc-shell.css", import.meta.url), "utf8");
const demoPrimitivesCss = readFileSync(new URL("./demo-v10-primitives.css", import.meta.url), "utf8");
const visualScreensCss = readFileSync(new URL("./visual-abc-screens.css", import.meta.url), "utf8");
const overviewV10Css = readFileSync(new URL("./overview-v10.css", import.meta.url), "utf8");
const demoOverviewCss = readFileSync(new URL("./demo-v10-overview.css", import.meta.url), "utf8");
const demoSettingsCss = readFileSync(new URL("./demo-v10-settings.css", import.meta.url), "utf8");
const mainEntrypoint = readFileSync(new URL("../main.tsx", import.meta.url), "utf8");

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
  it("uses tokens.css as the single theme source for shell and legacy screen styles", () => {
    expect(mainEntrypoint).toContain('import "./lib/theme"');
    expect(shellCss).toContain("--bg: var(--bg-base)");
    expect(shellCss).toContain("--vi: var(--primary-600)");
    expect(shellCss).toContain("--text: var(--text-primary)");
    expect(shellCss).not.toContain("--bg: #fff8ef");
    expect(shellCss).not.toContain("--vi: #e85d04");
    expect(shellCss).not.toContain(':root[data-theme="light"] {');

    expect(demoPrimitivesCss).toContain("--demo-bg: var(--bg-base)");
    expect(demoPrimitivesCss).toContain("--demo-vi: var(--primary-600)");
    expect(demoPrimitivesCss).toContain("--demo-text: var(--text-primary)");
    expect(demoPrimitivesCss).not.toContain("--demo-bg: #fff8ef");
    expect(demoPrimitivesCss).not.toContain(':root[data-theme="dark"] {');
    expect(demoPrimitivesCss).not.toContain(':root[data-theme="light"] {');

    expect(visualScreensCss).toContain("background: var(--surface-sunken) !important");
    expect(visualScreensCss).toContain("background: color-mix(in srgb, var(--surface-raised) 86%, transparent) !important");
    expect(demoSettingsCss).toContain("linear-gradient(138deg, var(--hero-from), var(--hero-mid) 58%, var(--hero-to))");
    expect(demoSettingsCss).not.toContain("#071d25");
    expect(demoSettingsCss).not.toContain("#0e3134");
    expect(overviewV10Css).toContain("var(--text-primary) 0%");
    expect(overviewV10Css).toContain("color: var(--text-tertiary)");
    expect(overviewV10Css).not.toContain("rgba(240, 238, 255, 0.18)");
    expect(demoOverviewCss).toContain("color: var(--text-primary)");
    expect(demoOverviewCss).toContain("color: var(--success-600)");
    expect(demoOverviewCss).toContain("color: var(--warning-600)");
    expect(demoOverviewCss).not.toContain("#7c2d12");
    expect(demoOverviewCss).not.toContain("color: #047857");
    expect(demoOverviewCss).not.toContain("color: #b45309");
  });

  it("keeps Transactions on canonical theme tokens with its own ledger-first layout", () => {
    expect(transactionsCss).toContain("background: var(--bg-base)");
    expect(transactionsCss).toContain("color: var(--text-primary)");
    expect(transactionsCss).toContain("background: var(--primary-050)");
    expect(transactionsCss).toContain(".tx-wrap .txv2-row:active");
    expect(transactionsCss).toContain("background: var(--surface-sunken)");
    expect(transactionsCss).toContain("padding-bottom: max(176px, calc(136px + env(safe-area-inset-bottom, 0px)))");
    expect(transactionsCss).toContain("Small ledger summary, not a large Overview asset/PnL hero");
    expect(transactionsCss).not.toContain("var(--vi)");
    expect(transactionsCss).not.toContain("var(--g)");
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
