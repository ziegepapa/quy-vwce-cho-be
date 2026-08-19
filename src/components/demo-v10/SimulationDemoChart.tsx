import { round2 } from "../../lib/calc";
import type { ProjectOutput, Scenario, YearPoint } from "../../lib/simulation/engine";

function formatMoneyRounded(n: number): string {
  const v = Math.round(n);
  const abs = Math.abs(v);
  const s = abs.toLocaleString("de-DE", { maximumFractionDigits: 0 });
  return (v < 0 ? "\u2212" : "") + s + " \u20ac";
}

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
}: {
  results: ChartResult[];
  markers: { name: string; yearIndex: number; amount: number }[];
  years: number;
  band: number;
  baseRate: number;
}) {
  const W = 320;
  const H = 168;
  const padL = 8;
  const padR = 52;
  const padT = 12;
  const padB = 24;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const allVals = results.flatMap((r) => r.out.yearEnds.map((p) => p.total));
  const maxV = Math.max(1, ...allVals, ...markers.map((m) => m.amount));
  const maxX = Math.max(1, years);

  function x(yi: number): number {
    return padL + (yi / maxX) * innerW;
  }
  function y(v: number): number {
    return padT + innerH - (v / maxV) * innerH;
  }

  function pathFor(points: YearPoint[]): string {
    if (points.length === 0) return "";
    return points
      .map((p, i) => `${i === 0 ? "M" : "L"}${x(p.yearIndex).toFixed(1)},${y(p.total).toFixed(1)}`)
      .join(" ");
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
  const bandPctText = `${loPct.toLocaleString("de-DE")}% \u2013 ${hiPct.toLocaleString("de-DE")}%`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      role="img"
      aria-label="Biểu đồ tài sản theo năm"
      className="demo-v10-sim-chart-svg"
      style={{ display: "block" }}
    >
      {showBand && cautious && bull && (
        <path
          d={bandArea(cautious.out.yearEnds, bull.out.yearEnds)}
          fill={scenarioColor("base")}
          opacity={0.14}
        />
      )}
      {base && (
        <path
          d={pathFor(base.out.yearEnds)}
          fill="none"
          stroke={scenarioColor("base")}
          strokeWidth={2.5}
          strokeLinejoin="round"
        />
      )}
      {markers.map((m) => (
        <g key={m.name + m.yearIndex}>
          <line
            x1={x(m.yearIndex)}
            x2={x(m.yearIndex)}
            y1={padT}
            y2={padT + innerH}
            stroke="rgba(240,238,255,.25)"
            strokeDasharray="4 3"
          />
          <circle cx={x(m.yearIndex)} cy={y(m.amount)} r={3} fill="rgba(240,238,255,.45)" />
        </g>
      ))}
      {baseEnd && (
        <text
          x={W - 4}
          y={y(baseEnd.total)}
          fontSize={10}
          fill={scenarioColor("base")}
          textAnchor="end"
          dominantBaseline="middle"
        >
          {formatMoneyRounded(baseEnd.total)}
        </text>
      )}
      {showBand && (
        <text x={W - 4} y={padT + 10} fontSize={9} fill="rgba(240,238,255,.4)" textAnchor="end">
          {bandPctText}
        </text>
      )}
      <text x={padL} y={H - 6} fontSize={10} fill="rgba(240,238,255,.4)">
        0
      </text>
      <text x={W - padR} y={H - 6} fontSize={10} fill="rgba(240,238,255,.4)" textAnchor="end">
        {years}n
      </text>
    </svg>
  );
}
