import { useId, useMemo } from "react";
import type { ValueHistoryPoint } from "../lib/valueHistory";

const W = 560;
const H = 110;
const PAD_X = 4;
const PAD_TOP = 10;
const PAD_BOTTOM = 18;

/**
 * Portfolio value history as a quiet area chart. Real monthly points only —
 * no smoothing, no projection. Pure SVG, no chart library.
 */
export default function ValueHistoryChart({ points, label }: { points: ValueHistoryPoint[]; label: string }) {
  const gradientId = useId();
  const geometry = useMemo(() => {
    if (points.length < 2) return null;
    const values = points.map((p) => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const innerW = W - PAD_X * 2;
    const innerH = H - PAD_TOP - PAD_BOTTOM;
    const x = (i: number) => PAD_X + (i / (points.length - 1)) * innerW;
    const y = (v: number) => PAD_TOP + innerH - ((v - min) / span) * innerH;
    const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
    const area = `${line} L${x(points.length - 1).toFixed(1)},${(H - PAD_BOTTOM).toFixed(1)} L${x(0).toFixed(1)},${(H - PAD_BOTTOM).toFixed(1)} Z`;
    // Sparse month labels: first, middle, last — never crowded.
    const labelIdx = points.length <= 4
      ? points.map((_, i) => i)
      : [0, Math.floor((points.length - 1) / 2), points.length - 1];
    return { line, area, x, y, labelIdx, lastX: x(points.length - 1), lastY: y(points[points.length - 1].value) };
  }, [points]);

  if (!geometry) return null;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="ovc-history-chart"
      role="img"
      aria-label={label}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--primary-600)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--primary-600)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={geometry.area} fill={`url(#${gradientId})`} />
      <path d={geometry.line} fill="none" stroke="var(--primary-600)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={geometry.lastX} cy={geometry.lastY} r="4.5" fill="var(--primary-600)" stroke="var(--surface-raised)" strokeWidth="2" />
      {geometry.labelIdx.map((i) => (
        <text
          key={points[i].month}
          x={geometry.x(i)}
          y={H - 4}
          textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}
          className="ovc-history-label"
        >
          {points[i].label}
        </text>
      ))}
    </svg>
  );
}
