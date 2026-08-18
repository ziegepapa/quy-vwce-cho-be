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
import { computeHeroOwnedContribution } from "../lib/heroOwned";
import { getPlanPhase } from "../lib/planPhase";
import TodayCenter from "../components/TodayCenter";
import TraceSheet from "../components/TraceSheet";
import RhythmHero from "../components/RhythmHero";
import PlanPhaseCard from "../components/PlanPhaseCard";
import "../styles/rhythm-hero.css";

export default function Overview({ refreshKey = 0 }: { displayName?: string; refreshKey?: number }) {
  void refreshKey;
  return (
    <div className="ov">
      <p role="alert">Overview temporarily incomplete — do not merge this branch until full file is restored.</p>
    </div>
  );
}
