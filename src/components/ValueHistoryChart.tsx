import { useId, useMemo } from "react";
import type { ValueHistoryPoint } from "../lib/valueHistory";

const W = 560;
const H = 240;
const PAD_L = 46;
const PAD_R = 64;
const PAD_TOP = 16;
const PAD_BOTTOM = 24;

function compact(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(".", ",")}k`;
  return `${Math.round(n)}`;
}

/**
 * Honest value history: the portfolio VALUE line next to the cumulative
 * CONTRIBUTIONS line. Most of the climb is money the owner put in — the gap
 * between the two lines is the real gain. Real monthly points only, no
 * smoothing, no projection. Pure SVG, no chart library.
 */
export default function ValueHistoryChart({ points, label }: { points: ValueHistoryPoint[]; label: string }) {
  const gradientId = useId();
  const geometry = useMemo(() => {
    if (points.length < 2) return null;
    const maxV = Math.max(...points.map((p) => Math.max(p.value, p.contributed)));
    const max = maxV <= 0 ? 1 : maxV * 1.08;
    const innerW = W - PAD_L - PAD_R;
    const innerH = H - PAD_TOP - PAD_BOTTOM;
    const x = (i: number) => PAD_L + (i / (points.length - 1)) * innerW;
    const y = (v: number) => PAD_TOP + innerH - (v / max) * innerH;
    const lineFor = (pick: (p: ValueHistoryPoint) => number) =>
      points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(pick(p)).toFixed(1)}`).join(" ");
    const valueLine = lineFor((p) => p.value);
    const contribLine = lineFor((p) => p.contributed);
    const area = `${valueLine} L${x(points.length - 1).toFixed(1)},${(H - PAD_BOTTOM).toFixed(1)} L${x(0).toFixed(1)},${(H - PAD_BOTTOM).toFixed(1)} Z`;
    const ticks = [0, max / 4, max / 2, (max * 3) / 4, max];
    const labelCount = Math.min(6, points.length);
    const labelIdx = Array.from({ length: labelCount }, (_, i) =>
      Math.round((i * (points.length - 1)) / Math.max(1, labelCount - 1)),
    ).filter((idx, i, all) => all.indexOf(idx) === i);
    const last = points[points.length - 1];
    return { valueLine, contribLine, area, x, y, ticks, labelIdx, last, max };
  }, [points]);

  if (!geometry) return null;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="ovb2-chart"
      role="img"
      aria-label={label}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--success-600)" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#16a34a" stopOpacity="0" />
        </linearGradient>
      </defs>
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
      <path d={geometry.area} fill={`url(#${gradientId})`} />
      <path
        d={geometry.contribLine}
        fill="none" stroke="#94a3b8" strokeWidth="2"
        strokeDasharray="6,5" strokeLinecap="round"
      />
      <path
        d={geometry.valueLine}
        fill="none" stroke="#16a34a" strokeWidth="2.5"
        strokeLinecap="round" strokeLinejoin="round"
      />
      <circle
        cx={geometry.x(points.length - 1)}
        cy={geometry.y(geometry.last.value)}
        r="4.5" fill="var(--success-600)" stroke="var(--surface-raised)" strokeWidth="2"
      />
      <text
        x={geometry.x(points.length - 1) + 8}
        y={geometry.y(geometry.last.value) - 6}
        fontSize="11" fontWeight="700" fill="#16856f"
      >
        {geometry.last.value.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
      </text>
      <text
        x={geometry.x(points.length - 1) + 8}
        y={geometry.y(geometry.last.contributed) + 14}
        fontSize="12" fill="#64748b"
      >
        {geometry.last.contributed.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
      </text>
      {geometry.labelIdx.map((i) => (
        <text
          key={points[i].month}
          x={geometry.x(i)}
          y={H - 6}
          textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}
          fontSize="11" fill="#64748b"
        >
          {points[i].label}
        </text>
      ))}
    </svg>
  );
}
