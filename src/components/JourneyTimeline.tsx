import type { JourneyEvent } from "../lib/journeyTimeline";

type Props = {
  events: JourneyEvent[];
  /** Section title, locale-aware. */
  title: string;
};

/**
 * The fund's story as a quiet vertical timeline: first contribution,
 * value milestones, today. Real events only — nothing invented.
 */
export default function JourneyTimeline({ events, title }: Props) {
  return (
    <div className="ovc-journey">
      <div className="ovc-card-head">
        <h2 className="ovc-title">{title}</h2>
      </div>
      <ol className="ovc-journey-list">
        {events.map((e) => (
          <li key={`${e.kind}-${e.date}`} className={`ovc-journey-item k-${e.kind}`}>
            <span className="ovc-journey-dot" aria-hidden />
            <div className="ovc-journey-body">
              <div className="ovc-journey-date">{e.dateLabel}</div>
              <div className="ovc-journey-title">{e.title}</div>
              <div className="ovc-muted">{e.detail}</div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
