import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  getSettings,
  listGoals,
  listInstruments,
  listQuotes,
  listTransactions,
  saveSettings,
} from "../lib/db";
import type { AppSettings, Goal, Instrument, PlanTarget, Quote, Transaction } from "../lib/types";
import {
  formatMoney,
  inflate,
  monthsBetween,
  parseDate,
} from "../lib/calc";
import { buildOverviewHero, shouldShowContributionNudge } from "../lib/overviewNumbers";
import { buildAllocationDisplay, describeAllocation } from "../lib/overviewAllocation";
import {
  buildCostBasisDisplay,
  describeCostBasis,
  describePnlSuppression,
  summarizeCostBasisLedger,
} from "../lib/overviewCostBasis";
import { buildTodayCenterPortfolioSnapshot } from "../lib/todayCenterAdapter";
import { buildPortfolioTraceModel } from "../lib/todayCenterTrace";
import {
  buildNhipInsightInput,
  buildNhipInsights,
  CONTRIBUTION_WINDOW_DAYS,
  type NhipInsight,
} from "../lib/nhipInsights";
import { computeContributionStreak } from "../lib/contributionStreak";
import { computeHeroLifetimeContribution } from "../lib/heroLifetime";
import { getPlanPhase } from "../lib/planPhase";
import TodayCenter from "../components/TodayCenter";
import TraceSheet from "../components/TraceSheet";
import RhythmHero from "../components/RhythmHero";
import PlanPhaseCard from "../components/PlanPhaseCard";
import "../styles/rhythm-hero.css";

type Insight = {
  id: string;
  priority: "high" | "medium" | "low";
  title: string;
  why: string;
  cta: string;
  to: string;
};

export default function Overview({ refreshKey = 0 }: { displayName?: string; refreshKey?: number }) {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [detailOpen, setDetailOpen] = useState(false);
  const [moreActions, setMoreActions] = useState(false);
  const [traceOpen, setTraceOpen] = useState(false);
  const [statStripOpen, setStatStripOpen] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(false);
    void (async () => {
      try {
        const [nextSettings, nextGoals, nextTransactions, nextInstruments, nextQuotes] =
          await Promise.all([
            getSettings(),
            listGoals(),
            listTransactions(),
            listInstruments(),
            listQuotes(),
          ]);
        if (!active) return;
        setSettings(nextSettings);
        setGoals(nextGoals);
        setTransactions(nextTransactions);
        setInstruments(nextInstruments);
        setQuotes(nextQuotes);
        setLoading(false);
      } catch {
        if (!active) return;
        setLoadError(true);
        setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [refreshKey, loadAttempt]);

  // PLACEHOLDER_REMAINDER - will complete in next commit if truncated
  void navigate; void detailOpen; void moreActions; void setDetailOpen; void setMoreActions; void setStatStripOpen; void statStripOpen; void instruments; void quotes; void goals; void settings; void transactions;
  return (
    <div className="ov">
      <p role="alert">Overview restore in progress — structural hero-flex pending full body.</p>
    </div>
  );
}
