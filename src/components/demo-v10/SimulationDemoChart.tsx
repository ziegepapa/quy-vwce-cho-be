import type { ProjectOutput, Scenario, YearPoint } from "../../lib/simulation/engine";
import { round2 } from "../../lib/calc";
import { formatDisplayMoney, type DisplayLocale } from "../../ui/localeFormatting";

function scenarioColor(id: string): string {
  if (id === "cautious") return "var(--demo-sub, #a78bfa)";
  if (id === "bull") return "var(--demo-em, #10b981)";
  return "var(--demo-vi, #8b5cf6)";
}

export type ChartResult = {
  sc: Scenario;
  out: ProjectOutput;
};

export function SimulationDemoChart({
  results,
  markers,
  years,
  band,
  baseRate,
  locale,
}: {
  results: ChartResult[];
  markers: { name: string; yearIndex: number; amount: number }[];
  years: number;
  band: number;
  baseRate: number;
  locale: DisplayLocale;
}) {
  const W = 320;
  const H = 168;
  const padL = 8;
  const padR = 52;
  const padT = 12;
  const padB = 24;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const allVals = results.flatMap((r) => r.out.yearEnds.flatMap((p) => [p.total, p.contributed]));
  const maxV = Math.max(1, ...allVals, ...markers.map((m) => m.amount));
  const maxX = Math.max(1, years);

  function x(yi: number): number {
    return padL + (yi / maxX) * innerW;
  }
  function y(v: number): number {
    return padT + innerH - (v / maxV) * innerH;
  }

  function pathFor(points: YearPoint[], value: "total" | "contributed" = "total"): string {
    if (points.length === 0) return "";
    return points
      .map((p, i) => `${i === 0 ? "M" : "L"}${x(p.yearIndex).toFixed(1)},${y(p[value]).toFixed(1)}`)
      .join(" ");
  }

  function areaToBaseline(points: YearPoint[], value: "total" | "contributed"): string {
    if (points.length === 0) return "";
    const line = pathFor(points, value);
    const first = points[0];
    const last = points[points.length - 1];
    return `${line} L${x(last.yearIndex).toFixed(1)},${(padT + innerH).toFixed(1)} L${x(first.yearIndex).toFixed(1)},${(padT + innerH).toFixed(1)} Z`;
  }

  function bandArea(low: YearPoint[], high: YearPoint[]): string {
    if (low.length === 0 || high.length === 0) return "";
    const forward = high
      .map((p, i) => `${i === 0 ? "M" : "L"}${x(p.yearIndex).toFixed(1)},${y(p.total).toFixed(1)}`)
      .join(" ");
    const back = [...low]
      .reverse()
      .map((p) => `L${x(p.yearIndex).toFixed(1)},${y(p.total).toFixed(1)}`)
      .join(" ");
    return `${forward} ${back} Z`;
  }

  const cautious = results.find((r) => r.sc.id === "cautious");
  const base = results.find((r) => r.sc.id === "base");
  const bull = results.find((r) => r.sc.id === "bull");
  const showBand = band > 0 && !!cautious && !!bull;
  const baseEnd = base?.out.yearEnds[base.out.yearEnds.length - 1];
  const loPct = round2(Math.max(0, baseRate - band) * 100);
  const hiPct = round2((baseRate + band) * 100);
  const bandPctText = `${loPct.toLocaleString(locale === "de" ? "de-DE" : "vi-VN")}% – ${hiPct.toLocaleString(locale === "de" ? "de-DE" : "vi-VN")}%`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      role="img"
      aria-label={locale === "de" ? "Diagramm für Einzahlungen und prognostiziertes Portfolio nach Jahren" : "Biểu đồ vốn góp và danh mục dự báo theo năm"}
      className="sim-chart-svg"
      style={{ display: "block" }}
    >
      <defs>
        <linearGradient id="chart-deposit-gradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--demo-vi)" stopOpacity=".45" />
          <stop offset="100%" stopColor="var(--demo-vi)" stopOpacity=".04" />
        </linearGradient>
        <linearGradient id="chart-projection-gradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--demo-em)" stopOpacity=".55" />
          <stop offset="100%" stopColor="var(--demo-em)" stopOpacity=".05" />
        </linearGradient>
      </defs>
      {showBand && cautious && bull ? (
        <path d={bandArea(cautious.out.yearEnds, bull.out.yearEnds)} fill={scenarioColor("base")} opacity={0.13} />
      ) : null}
      {base ? (
        <>
          <path d={areaToBaseline(base.out.yearEnds, "contributed")} fill="url(#chart-deposit-gradient)" />
          <path d={areaToBaseline(base.out.yearEnds, "total")} fill="url(#chart-projection-gradient)" />
          <path d={pathFor(base.out.yearEnds, "contributed")} fill="none" stroke="var(--demo-vi)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
          <path d={pathFor(base.out.yearEnds, "total")} fill="none" stroke="var(--demo-em)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : null}
      {markers.map((m) => (
        <g key={m.name + m.yearIndex}>
          <line x1={x(m.yearIndex)} x2={x(m.yearIndex)} y1={padT} y2={padT + innerH} stroke="rgba(240,238,255,.25)" strokeDasharray="4 3" />
          <circle cx={x(m.yearIndex)} cy={y(m.amount)} r={3} fill="rgba(240,238,255,.45)" />
        </g>
      ))}
      {baseEnd ? (
        <text x={W - 4} y={y(baseEnd.total)} fontSize={10} fill="var(--demo-em)" textAnchor="end" dominantBaseline="middle">
          {formatDisplayMoney(Math.round(baseEnd.total), locale)}
        </text>
      ) : null}
      {showBand ? <text x={W - 4} y={padT + 10} fontSize={9} fill="rgba(240,238,255,.4)" textAnchor="end">{bandPctText}</text> : null}
      <text x={padL} y={H - 6} fontSize={10} fill="rgba(240,238,255,.4)">0</text>
      <text x={W - padR} y={H - 6} fontSize={10} fill="rgba(240,238,255,.4)" textAnchor="end">{years}{locale === "de" ? " J" : "n"}</text>
    </svg>
  );
}
