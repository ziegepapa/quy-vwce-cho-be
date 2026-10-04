import { useMemo } from "react";
import type { ContributionHeatmap } from "../lib/contributionHeatmap";

type Props = {
  heatmap: ContributionHeatmap;
  /** Section title, locale-aware. */
  title: string;
  /** Summary line, locale-aware. */
  summary: string;
  /** Tooltip template: (label, amount) => string. */
  tooltip: (label: string, amount: string) => string;
  formatAmount: (amount: number) => string;
};

/**
 * Monthly contribution rhythm as a quiet heatmap. One column per month,
 * intensity = amount vs the strongest month. Real data only.
 */
export default function ContributionHeatmap({ heatmap, title, summary, tooltip, formatAmount }: Props) {
  const labelIdx = useMemo(() => {
    const n = heatmap.months.length;
    if (n <= 6) return heatmap.months.map((_, i) => i);
    const idx = new Set([0, n - 1]);
    const step = Math.max(1, Math.floor(n / 6));
    for (let i = step; i < n - 1; i += step) idx.add(i);
    return [...idx].sort((a, b) => a - b);
  }, [heatmap]);

  return (
    <div className="ovc-heatmap">
      <div className="ovc-card-head">
        <h2 className="ovc-title">{title}</h2>
        <span className="ovc-muted">{summary}</span>
      </div>
      <div
        className="ovc-heatmap-grid"
        role="img"
        aria-label={`${title} · ${summary}`}
        style={{ gridTemplateColumns: `repeat(${heatmap.months.length}, 1fr)` }}
      >
        {heatmap.months.map((m) => (
          <span
            key={m.month}
            className={`ovc-heatmap-cell lv${m.level}`}
            title={tooltip(m.label, formatAmount(m.amount))}
          />
        ))}
        {heatmap.months.map((m, i) => (
          <span key={`${m.month}-lbl`} className="ovc-heatmap-lbl" aria-hidden>
            {labelIdx.includes(i) ? m.label : ""}
          </span>
        ))}
      </div>
    </div>
  );
}
