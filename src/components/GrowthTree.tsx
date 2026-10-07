import { useLocale } from "../lib/locale";
import {
  formatTreeMoney,
  treeCopy,
  treeStageForValue,
  type TreeStage,
} from "../lib/growthTree";

type Props = {
  /** Current portfolio value in EUR. */
  value: number;
  /** Next milestone from the daily briefing, if known. */
  nextMilestone: { target: number; remaining: number; progressPct: number } | null;
};

const TRUNK = "#8a6b3f";
const LEAF = "#10b981";
const LEAF_MID = "#34d399";
const LEAF_LIGHT = "#6ee7b7";

function TreeArt({ stage }: { stage: TreeStage }) {
  return (
    <svg viewBox="0 0 200 170" className="ovc-tree-art" role="img" aria-hidden>
      <defs>
        <radialGradient id="ovc-tree-glow" cx="50%" cy="42%" r="55%">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="100" cy="72" rx="78" ry="62" fill="url(#ovc-tree-glow)" />
      <ellipse cx="100" cy="150" rx="58" ry="10" fill="#8a6b3f" opacity="0.28" />

      {stage === 0 && (
        <g>
          <ellipse cx="100" cy="146" rx="15" ry="6" fill="#6b4f2e" />
          <path d="M100 146 C100 139 100 135 100 131" stroke={LEAF_MID} strokeWidth="2.5" strokeLinecap="round" fill="none" />
          <ellipse cx="94" cy="132" rx="6" ry="3.4" fill={LEAF} transform="rotate(-28 94 132)" />
          <ellipse cx="106" cy="132" rx="6" ry="3.4" fill={LEAF_MID} transform="rotate(28 106 132)" />
        </g>
      )}

      {stage === 1 && (
        <g>
          <path d="M100 148 C100 137 99 128 100 116" stroke={LEAF_MID} strokeWidth="3.5" strokeLinecap="round" fill="none" />
          <ellipse cx="90" cy="120" rx="10" ry="5.5" fill={LEAF} transform="rotate(-30 90 120)" />
          <ellipse cx="110" cy="120" rx="10" ry="5.5" fill={LEAF_MID} transform="rotate(30 110 120)" />
          <ellipse cx="100" cy="110" rx="7" ry="9" fill={LEAF_LIGHT} opacity="0.9" />
        </g>
      )}

      {stage >= 2 && (
        <g>
          <path
            d={
              stage === 2
                ? "M100 148 L100 98"
                : stage === 3
                  ? "M100 148 L100 76 M100 108 L80 92 M100 108 L120 92"
                  : "M100 148 L100 58 M100 96 L74 76 M100 96 L126 76 M100 118 L84 104 M100 118 L116 104"
            }
            stroke={TRUNK}
            strokeWidth={stage === 2 ? 5 : stage === 3 ? 8 : 11}
            strokeLinecap="round"
            fill="none"
          />
          {stage === 2 && (
            <g>
              <circle cx="100" cy="80" r="21" fill={LEAF} opacity="0.92" />
              <circle cx="84" cy="90" r="12" fill={LEAF_MID} opacity="0.85" />
              <circle cx="116" cy="90" r="12" fill={LEAF_MID} opacity="0.85" />
              <circle cx="93" cy="73" r="7" fill={LEAF_LIGHT} opacity="0.7" />
            </g>
          )}
          {stage === 3 && (
            <g>
              <circle cx="100" cy="54" r="29" fill={LEAF} opacity="0.92" />
              <circle cx="73" cy="68" r="18" fill={LEAF_MID} opacity="0.88" />
              <circle cx="127" cy="68" r="18" fill={LEAF_MID} opacity="0.88" />
              <circle cx="100" cy="36" r="16" fill={LEAF_MID} opacity="0.8" />
              <circle cx="90" cy="48" r="9" fill={LEAF_LIGHT} opacity="0.65" />
              <circle cx="112" cy="60" r="7" fill={LEAF_LIGHT} opacity="0.6" />
            </g>
          )}
          {stage === 4 && (
            <g>
              <circle cx="100" cy="44" r="36" fill={LEAF} opacity="0.94" />
              <circle cx="66" cy="60" r="22" fill={LEAF_MID} opacity="0.9" />
              <circle cx="134" cy="60" r="22" fill={LEAF_MID} opacity="0.9" />
              <circle cx="100" cy="24" r="20" fill={LEAF_MID} opacity="0.82" />
              <circle cx="82" cy="36" r="10" fill={LEAF_LIGHT} opacity="0.7" />
              <circle cx="118" cy="40" r="9" fill={LEAF_LIGHT} opacity="0.65" />
              <circle cx="100" cy="52" r="7" fill={LEAF_LIGHT} opacity="0.6" />
              <circle cx="70" cy="48" r="4.5" fill="#fbbf24" opacity="0.9" />
              <circle cx="130" cy="52" r="4.5" fill="#fbbf24" opacity="0.9" />
              <circle cx="100" cy="34" r="4.5" fill="#fbbf24" opacity="0.9" />
            </g>
          )}
        </g>
      )}
    </svg>
  );
}

/**
 * The fund as a living tree: grows through five stages as the portfolio
 * crosses value milestones. Pure display — all numbers come from props.
 */
export default function GrowthTree({ value, nextMilestone }: Props) {
  const { locale } = useLocale();
  const stage = treeStageForValue(value);
  const copy = treeCopy(locale, stage);

  const pct = nextMilestone ? Math.max(0, Math.min(100, nextMilestone.progressPct)) : null;

  return (
    <div className="ovc-tree">
      <div className="ovc-card-head">
        <h2 className="ovc-title">{copy.title}</h2>
      </div>
      <TreeArt stage={stage} />
      <div className="ovc-tree-stage">{copy.stageName}</div>
      <div className="ovc-tree-value">{formatTreeMoney(value, locale)}</div>
      {nextMilestone ? (
        <div className="ovc-tree-next">
          <div className="ovc-tree-next-label">
            {copy.nextMilestone(formatTreeMoney(nextMilestone.remaining, locale), formatTreeMoney(nextMilestone.target, locale))}
          </div>
          <div className="ovc-bar" role="progressbar" aria-valuenow={Math.round(pct ?? 0)} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${pct ?? 0}%` }} />
          </div>
        </div>
      ) : (
        <div className="ovc-tree-next-label">{copy.allReached}</div>
      )}
    </div>
  );
}
