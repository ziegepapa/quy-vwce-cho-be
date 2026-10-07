import { useMemo } from "react";
import type { ContributionHeatmap, HeatmapMonth } from "../lib/contributionHeatmap";

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

type YearGroup = { year: string; months: HeatmapMonth[] };

/**
 * Monthly contribution rhythm as a slim waveform strip.
 * One row per year; bar height + color encode intensity.
 * No per-month labels — details live in the tooltip.
 * Real data only.
 */
export default function ContributionHeatmap({ heatmap, title, summary, tooltip, formatAmount }: Props) {
  const years = useMemo<YearGroup[]>(() => {
    const groups = new Map<string, HeatmapMonth[]>();
    for (const m of heatmap.months) {
      const year = m.month.slice(0, 4);
      const list = groups.get(year);
      if (list) list.push(m);
      else groups.set(year, [m]);
    }
    return [...groups.entries()].map(([year, months]) => ({ year, months }));
  }, [heatmap]);

  return (
    <div className="ovc-rhythm">
      <div className="ovc-card-head">
        <h2 className="ovc-title">{title}</h2>
        <span className="ovc-muted">{summary}</span>
      </div>
      <div className="ovc-rhythm-years" role="img" aria-label={`${title} · ${summary}`}>
        {years.map(({ year, months }) => (
          <div key={year} className="ovc-rhythm-year">
            <span className="ovc-rhythm-year-lbl" aria-hidden>{year}</span>
            <div className="ovc-rhythm-bars">
              {months.map((m) => (
                <span
                  key={m.month}
                  className={`ovc-rhythm-bar lv${m.level}`}
                  title={tooltip(m.label, formatAmount(m.amount))}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
