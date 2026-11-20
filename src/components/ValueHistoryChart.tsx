import { useMemo } from "react";
import { useLocale } from "../lib/locale";
import type { ValueHistoryPoint } from "../lib/valueHistory";

const W = 400;
const H = 220;
const PAD_L = 46;
const PAD_R = 17;
const PAD_TOP = 16;
const PAD_BOTTOM = 24;

function compact(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(".", ",")}k`;
  return `${Math.round(n)}`;
}

/** Plot contributions throughout, and break the portfolio line where a monthly valuation is missing. */
export default function ValueHistoryChart({ points, label }: { points: ValueHistoryPoint[]; label: string }) {
  const { locale } = useLocale();
  const geometry = useMemo(() => {
    if (points.length < 2) return null;
    const covered = points.map((p) => p.unpricedIsins.length === 0 && p.carriedForwardIsins.length === 0);
    const maxV = Math.max(...points.map((p, i) => Math.max(covered[i] ? p.value : 0, p.contributed)));
    const max = maxV <= 0 ? 1 : maxV * 1.08;
    const innerW = W - PAD_L - PAD_R;
    const innerH = H - PAD_TOP - PAD_BOTTOM;
    const x = (i: number) => PAD_L + (i / (points.length - 1)) * innerW;
    const y = (v: number) => PAD_TOP + innerH - (v / max) * innerH;
    const coords = (i: number, value: number) => `${x(i).toFixed(1)},${y(value).toFixed(1)}`;
    const contribLine = points.map((p, i) => `${i === 0 ? "M" : "L"}${coords(i, p.contributed)}`).join(" ");
    const valueLine = points.flatMap((p, i) => covered[i] && (covered[i - 1] || covered[i + 1])
      ? [`${covered[i - 1] ? "L" : "M"}${coords(i, p.value)}`]
      : [],
    ).join(" ");
    // One soft area per drawn segment (never across a gap).
    const valueAreas: string[] = [];
    let run: number[] = [];
    const flushRun = () => {
      if (run.length >= 2) {
        const first = run[0];
        const last = run[run.length - 1];
        const line = run.map((i) => `${i === first ? "M" : "L"}${coords(i, points[i].value)}`).join(" ");
        valueAreas.push(`${line} L${coords(last, 0)} L${coords(first, 0)} Z`);
      }
      run = [];
    };
    points.forEach((_p, i) => {
      if (covered[i] && (covered[i - 1] || covered[i + 1])) run.push(i);
      else flushRun();
    });
    flushRun();
    // Dots mark every drawn segment end — including its start — so a
    // resumed line (e.g. October after a September gap) is visible.
    const valueDots = points.flatMap((p, i) => covered[i] && (!covered[i - 1] || !covered[i + 1]) ? [{ x: x(i), y: y(p.value), month: p.month }] : []);
    const ticks = [0, max / 4, max / 2, (max * 3) / 4, max];
    const labelCount = Math.min(4, points.length);
    const labelIdx = Array.from({ length: labelCount }, (_, i) =>
      Math.round((i * (points.length - 1)) / Math.max(1, labelCount - 1)),
    ).filter((idx, i, all) => all.indexOf(idx) === i);
    return { valueLine, valueAreas, contribLine, valueDots, x, y, ticks, labelIdx, hasGaps: covered.includes(false) };
  }, [points]);

  if (!geometry) return null;

  const unpricedNote = locale === "de"
    ? "Lücken im Wertverlauf zeigen Monate mit fehlenden Kursen."
    : "Khoảng trống trên đường giá trị là những tháng thiếu dữ liệu giá.";

  return (
    <>
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="ovb2-chart"
      role="img"
      aria-label={label}
      preserveAspectRatio="xMidYMid meet"
    >
      {geometry.ticks.map((t) => (
        <g key={t}>
          <line
            x1={PAD_L} y1={geometry.y(t)} x2={W - PAD_R + 8} y2={geometry.y(t)}
            stroke="var(--border-subtle)" strokeWidth="1"
          />
          <text x={PAD_L - 8} y={geometry.y(t) + 4} textAnchor="end" fontSize="10.5" fill="var(--text-secondary)">
            {compact(t)} €
          </text>
        </g>
      ))}
      {geometry.valueAreas.map((d, i) => (
        <path key={i} d={d} fill="var(--primary-600)" fillOpacity={0.08} />
      ))}
      <path
        d={geometry.contribLine}
        fill="none" stroke="var(--text-tertiary)" strokeWidth="2"
        strokeDasharray="6,5" strokeLinecap="round"
      />
      {geometry.valueLine ? (
        <path
          data-series="portfolio-value" d={geometry.valueLine}
          fill="none" stroke="var(--primary-600)" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round"
        />
      ) : null}
      {geometry.valueDots.map((dot) => (
        <circle key={dot.month} data-month={dot.month} cx={dot.x} cy={dot.y}
          r="4.5" fill="var(--primary-600)" stroke="var(--surface-raised)" strokeWidth="2"
        />
      ))}
      {geometry.labelIdx.map((i) => (
        <text
          key={points[i].month}
          x={geometry.x(i)}
          y={H - 6}
          textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}
          fontSize="11" fill="var(--text-secondary)"
        >
          {points[i].label}
        </text>
      ))}
    </svg>
    {geometry.hasGaps ? <p className="ovb2-sub">{unpricedNote}</p> : null}
    </>
  );
}
