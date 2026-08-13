import { useEffect, useMemo, useState } from "react";
import { getSettings, listGoals, listQuotes, listTransactions } from "../lib/db";
import type { AppSettings, Goal, Quote, Transaction } from "../lib/types";
import {
  calcGoals,
  calcPortfolio,
  computeBlendedReturn,
  formatMoney,
  parseDate,
  simulateScenario,
} from "../lib/calc";
import { buildTodayCenterPortfolioSnapshot } from "../lib/todayCenterAdapter";
import { SCENARIOS } from "../lib/scenarioPresets";

type Tab = "simple" | "advanced";
type CompareKey = "monthly" | "return" | "inflation";
type AssumptionOrigin = "settings" | "what_if";

const today = () => new Date();

function pct(value: number) {
  return `${(value * 100).toFixed(value * 100 % 1 === 0 ? 0 : 1)}%`;
}

function SparkLine({ values, labels }: { values: number[]; labels: number[] }) {
  const width = 720;
  const height = 180;
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const points = values
    .map((v, i) => {
      const x = (i / Math.max(1, values.length - 1)) * width;
      const y = height - ((v - min) / Math.max(1, max - min)) * (height - 16) - 8;
      return `${x},${y}`;
    })
    .join(" ");
  const area = `0,${height} ${points} ${width},${height}`;
  const startYear = Math.min(...labels);
  const endYear = Math.max(...labels);
  const yEnd = height - ((values[values.length - 1] - min) / Math.max(1, max - min)) * (height - 16) - 8;

  return (
    <div className="spark-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} className="spark" role="img" aria-label="Biểu đồ mô phỏng">
        <defs>
          <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <polyline points={area} fill="url(#areaFill)" stroke="none" />
        <polyline points={points} fill="none" stroke="var(--color-accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={width} cy={yEnd} r="5" fill="var(--color-accent)" />
      </svg>
      <div className="spark-axis"><span>{startYear}</span><span>{endYear}</span></div>
    </div>
  );
}

export default function Simulation() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [tab, setTab] = useState<Tab>("simple");
  const [compare, setCompare] = useState<CompareKey>("monthly");
  const [selectedId, setSelectedId] = useState("base");
  const [monthly, setMonthly] = useState(300);
  const [annualReturn, setAnnualReturn] = useState(0.06);
  const [inflation, setInflation] = useState(0.02);
  const [durationYears, setDurationYears] = useState(18);
  const [saveRate, setSaveRate] = useState(0.03);
  const [safeRate, setSafeRate] = useState(0.025);
  const [startAmount, setStartAmount] = useState(0);
  const [endAmount, setEndAmount] = useState(0);
  const [planInflation, setPlanInflation] = useState(0.02);
  const [baseInflation, setBaseInflation] = useState(0.02);
  const [origin, setOrigin] = useState<AssumptionOrigin>("settings");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(false);
    void (async () => {
      try {
        const [loadedSettings, loadedGoals, loadedTransactions, loadedQuotes] = await Promise.all([
          getSettings(), listGoals(), listTransactions(), listQuotes(),
        ]);
        if (!active) return;
        const snapshot = buildTodayCenterPortfolioSnapshot({
          transactions: loadedTransactions,
          quotes: loadedQuotes,
          legacyVwcePrice: loadedSettings.latestVwcePrice,
          legacyVwcePriceAsOf: loadedSettings.latestPriceDate,
        });
        setSettings(loadedSettings);
        setGoals(loadedGoals);
        setTransactions(loadedTransactions);
        setQuotes(loadedQuotes);
        setMonthly(loadedSettings.monthlyContribution || 300);
        setAnnualReturn(loadedSettings.expectedReturn ?? 0.06);
        setInflation(loadedSettings.inflation ?? 0.02);
        setBaseInflation(loadedSettings.inflation ?? 0.02);
        setPlanInflation(loadedSettings.inflation ?? 0.02);
        setSaveRate(loadedSettings.saveRate ?? 0.03);
        setSafeRate(loadedSettings.safeRate ?? 0.025);
        setStartAmount(snapshot.portfolio.totalContributed);
        const endYear = parseDate(loadedSettings.endDate).getFullYear();
        setDurationYears(Math.max(1, endYear - today().getFullYear()));
        setLoading(false);
      } catch {
        if (!active) return;
        setLoadError(true);
        setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [loadAttempt]);

  const sourceSnapshot = useMemo(() => {
    if (!settings) return null;
    return buildTodayCenterPortfolioSnapshot({
      transactions,
      quotes,
      legacyVwcePrice: settings.latestVwcePrice,
      legacyVwcePriceAsOf: settings.latestPriceDate,
    });
  }, [settings, transactions, quotes]);

  const result = useMemo(() => {
    if (!settings) return null;
    const start = today();
    const end = new Date(start);
    end.setFullYear(start.getFullYear() + durationYears);
    const glide = [{ fromYear: start.getFullYear(), safeShare: 0 }];
    const blended = computeBlendedReturn(
      start.getFullYear(),
      settings.childBirthYear,
      saveRate,
      annualReturn,
      safeRate,
      glide,
    );
    const simulated = simulateScenario({
      startDate: start,
      endDate: end,
      startAmount,
      monthlyContribution: monthly,
      annualReturn,
      saveRate,
      safeRate,
      inflation,
      planInflation,
      startProtected: 0,
      endProtected: endAmount,
      protectedTarget: goals.reduce((sum, goal) => sum + goal.protectedAmount, 0),
      glidePath: glide,
      childBirthYear: settings.childBirthYear,
    });
    return { ...simulated, blendedReturn: blended };
  }, [settings, goals, durationYears, startAmount, monthly, annualReturn, saveRate, safeRate, inflation, planInflation, endAmount]);

  const current = useMemo(() => {
    if (!settings || !sourceSnapshot) return null;
    const portfolio = calcPortfolio(
      transactions,
      sourceSnapshot.vwcePrice,
      settings.trackInAppCash,
    );
    const goalsSummary = calcGoals(goals, today());
    return { portfolio, goalsSummary };
  }, [settings, goals, transactions, sourceSnapshot]);

  function applyPreset(id: string) {
    const preset = SCENARIOS.find((item) => item.id === id);
    if (!preset || !settings) return;
    setSelectedId(id);
    setAnnualReturn(preset.expectedReturn);
    setInflation(preset.inflation);
    setSaveRate(preset.saveRate);
    setSafeRate(preset.safeRate);
    setPlanInflation(preset.planInflation ?? preset.inflation);
    setMonthly(settings.monthlyContribution || 300);
    setOrigin("what_if");
    setNotice("Preset chỉ áp dụng cho trang What-if. Cài đặt thực tế không thay đổi.");
  }

  function compareValues() {
    if (compare === "monthly") {
      return [
        { label: "Thấp", value: 200, text: "200 €/tháng" },
        { label: "Cơ sở", value: 300, text: "300 €/tháng" },
        { label: "Cao", value: 500, text: "500 €/tháng" },
      ];
    }
    if (compare === "return") {
      return [
        { label: "Thấp", value: 0.03, text: "3%/năm" },
        { label: "Cơ sở", value: 0.06, text: "6%/năm" },
        { label: "Cao", value: 0.08, text: "8%/năm" },
      ];
    }
    return [
      { label: "Thấp", value: 0.01, text: "1%/năm" },
      { label: "Cơ sở", value: 0.02, text: "2%/năm" },
      { label: "Cao", value: 0.03, text: "3%/năm" },
    ];
  }

  function scenarioFuture(value: number) {
    if (!settings) return 0;
    const start = today();
    const end = new Date(start);
    end.setFullYear(start.getFullYear() + durationYears);
    return simulateScenario({
      startDate: start,
      endDate: end,
      startAmount,
      monthlyContribution: compare === "monthly" ? value : monthly,
      annualReturn: compare === "return" ? value : annualReturn,
      saveRate,
      safeRate,
      inflation: compare === "inflation" ? value : inflation,
      planInflation,
      startProtected: 0,
      endProtected: endAmount,
      protectedTarget: goals.reduce((sum, goal) => sum + goal.protectedAmount, 0),
      glidePath: [{ fromYear: start.getFullYear(), safeShare: 0 }],
      childBirthYear: settings.childBirthYear,
    }).endWealthNominal;
  }

  if (loading) {
    return (
      <div className="empty card" role="status" aria-live="polite" aria-busy="true">
        <p>Đang tải dữ liệu mô phỏng…</p>
      </div>
    );
  }

  if (loadError || !settings) {
    return (
      <section className="empty card" role="alert">
        <h1 className="page-title">Không tải được What-if</h1>
        <p>Dữ liệu trên thiết bị vẫn được giữ nguyên. Hãy thử tải lại.</p>
        <button type="button" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>
          Thử lại
        </button>
      </section>
    );
  }

  const noTransactions = transactions.length === 0;
  const chartValues = result?.timeline.map((item) => item.total) ?? [];
  const chartLabels = result?.timeline.map((item) => item.year) ?? [];
  const goalNeed = current?.goalsSummary.need ?? 0;
  const goalProtected = current?.goalsSummary.protected ?? 0;
  const gap = Math.max(0, goalNeed - goalProtected);
  const scenarioGap = result ? Math.max(0, goalNeed - result.endWealthNominal) : gap;
  const improves = scenarioGap < gap;
  const coverage = goalNeed > 0 && result ? Math.min(100, (result.endWealthNominal / goalNeed) * 100) : 100;

  return (
    <div>
      <div className="sim-header">
        <div>
          <h1 className="page-title">What-if</h1>
          <p className="page-subtitle">Thử giả định · dữ liệu thật không thay đổi</p>
        </div>
        <span className={`scenario-origin ${origin}`}>
          {origin === "settings" ? "Từ Cài đặt" : "Chỉ What-if"}
        </span>
      </div>
      {notice && <div className="banner info" role="status">{notice}</div>}

      <div className="segmented" role="tablist" aria-label="Chế độ mô phỏng">
        <button type="button" className={tab === "simple" ? "active" : ""} onClick={() => setTab("simple")}>Đơn giản</button>
        <button type="button" className={tab === "advanced" ? "active" : ""} onClick={() => setTab("advanced")}>Nâng cao</button>
      </div>

      {noTransactions && (
        <div className="card sim-start">
          <p className="muted">Chưa có giao dịch — thử kế hoạch từ đầu</p>
          <div className="field">
            <label htmlFor="sim-start-amount">Vốn ban đầu</label>
            <input id="sim-start-amount" type="number" min="0" step="100" value={startAmount} onChange={(event) => setStartAmount(Number(event.target.value))} />
          </div>
        </div>
      )}

      {tab === "simple" ? (
        <>
          <section className="card sim-focus">
            <div className="field">
              <div className="row-between">
                <label htmlFor="sim-monthly">Đóng góp mỗi tháng</label>
                <strong className="money-md">{formatMoney(monthly)}</strong>
              </div>
              <input id="sim-monthly" type="range" min="0" max="1500" step="25" value={monthly} onChange={(event) => { setMonthly(Number(event.target.value)); setOrigin("what_if"); setNotice(""); }} />
              <div className="range-labels"><span>0 €</span><span>1.500 €</span></div>
            </div>

            <div className="field">
              <div className="row-between">
                <label htmlFor="sim-return">Lợi suất kỳ vọng</label>
                <strong>{pct(annualReturn)}</strong>
              </div>
              <input id="sim-return" type="range" min="0" max="0.12" step="0.005" value={annualReturn} onChange={(event) => { setAnnualReturn(Number(event.target.value)); setOrigin("what_if"); setNotice(""); }} />
              <div className="range-labels"><span>0%</span><span>12%</span></div>
            </div>

            <div className="field">
              <div className="row-between">
                <label htmlFor="sim-duration">Thời gian</label>
                <strong>{durationYears} năm</strong>
              </div>
              <input id="sim-duration" type="range" min="1" max="30" step="1" value={durationYears} onChange={(event) => { setDurationYears(Number(event.target.value)); setOrigin("what_if"); setNotice(""); }} />
              <div className="range-labels"><span>1 năm</span><span>30 năm</span></div>
            </div>
          </section>

          {result && (
            <section className="card sim-result">
              <span className="metric-label">Kết quả ước tính</span>
              <div className="hero-money">{formatMoney(result.endWealthNominal)}</div>
              <p className="muted">Giá trị thực hôm nay: <strong>{formatMoney(result.endWealthRealToday)}</strong></p>
              <SparkLine values={chartValues} labels={chartLabels} />
            </section>
          )}

          <section className="card">
            <h2 className="section-title">Nếu thay đổi…</h2>
            <div className="compare-chips">
              <button type="button" className={compare === "monthly" ? "active" : ""} onClick={() => setCompare("monthly")}>Đóng góp</button>
              <button type="button" className={compare === "return" ? "active" : ""} onClick={() => setCompare("return")}>Lợi suất</button>
              <button type="button" className={compare === "inflation" ? "active" : ""} onClick={() => setCompare("inflation")}>Lạm phát</button>
            </div>
            <div className="scenario-grid">
              {compareValues().map((item) => {
                const value = scenarioFuture(item.value);
                const currentValue = result?.endWealthNominal ?? 0;
                const delta = value - currentValue;
                return (
                  <div className="scenario-card" key={item.label}>
                    <span className="metric-label">{item.label}</span>
                    <strong>{item.text}</strong>
                    <span className="money-md">{formatMoney(value)}</span>
                    <span className={`scenario-delta ${delta >= 0 ? "pos" : "neg"}`}>{delta >= 0 ? "+" : ""}{formatMoney(delta)}</span>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      ) : (
        <>
          <section className="card">
            <h2 className="section-title">Kịch bản mẫu</h2>
            <div className="scenario-grid">
              {SCENARIOS.map((preset) => (
                <button key={preset.id} type="button" className={`scenario-card scenario-preset ${selectedId === preset.id ? "selected" : ""}`} onClick={() => applyPreset(preset.id)}>
                  <strong>{preset.label}</strong>
                  <span>{pct(preset.expectedReturn)} lợi suất</span>
                  <span>{pct(preset.inflation)} lạm phát</span>
                  <small>{preset.description}</small>
                </button>
              ))}
            </div>
          </section>

          <section className="card">
            <h2 className="section-title">Giả định chi tiết</h2>
            <div className="grid2">
              <div className="field"><label htmlFor="adv-monthly">Đóng góp/tháng</label><input id="adv-monthly" type="number" min="0" step="25" value={monthly} onChange={(event) => { setMonthly(Number(event.target.value)); setOrigin("what_if"); setNotice(""); }} /></div>
              <div className="field"><label htmlFor="adv-return">Lợi suất</label><input id="adv-return" type="number" min="0" max="0.2" step="0.005" value={annualReturn} onChange={(event) => { setAnnualReturn(Number(event.target.value)); setOrigin("what_if"); setNotice(""); }} /></div>
              <div className="field"><label htmlFor="adv-inflation">Lạm phát</label><input id="adv-inflation" type="number" min="0" max="0.1" step="0.005" value={inflation} onChange={(event) => { setInflation(Number(event.target.value)); setOrigin("what_if"); setNotice(""); }} /></div>
              <div className="field"><label htmlFor="adv-duration">Số năm</label><input id="adv-duration" type="number" min="1" max="40" value={durationYears} onChange={(event) => { setDurationYears(Number(event.target.value)); setOrigin("what_if"); setNotice(""); }} /></div>
              <div className="field"><label htmlFor="adv-save">Lợi suất Savings</label><input id="adv-save" type="number" step="0.005" value={saveRate} onChange={(event) => { setSaveRate(Number(event.target.value)); setOrigin("what_if"); setNotice(""); }} /></div>
              <div className="field"><label htmlFor="adv-safe">Lợi suất Safe</label><input id="adv-safe" type="number" step="0.005" value={safeRate} onChange={(event) => { setSafeRate(Number(event.target.value)); setOrigin("what_if"); setNotice(""); }} /></div>
              <div className="field"><label htmlFor="adv-plan-inf">Lạm phát kế hoạch</label><input id="adv-plan-inf" type="number" step="0.005" value={planInflation} onChange={(event) => { setPlanInflation(Number(event.target.value)); setOrigin("what_if"); setNotice(""); }} /></div>
              <div className="field"><label htmlFor="adv-end">Đích bảo vệ cuối kỳ</label><input id="adv-end" type="number" min="0" step="100" value={endAmount} onChange={(event) => { setEndAmount(Number(event.target.value)); setOrigin("what_if"); setNotice(""); }} /></div>
            </div>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setAnnualReturn(settings.expectedReturn);
                setInflation(baseInflation);
                setPlanInflation(baseInflation);
                setSaveRate(settings.saveRate);
                setSafeRate(settings.safeRate);
                setMonthly(settings.monthlyContribution);
                setOrigin("settings");
                setNotice("Đã nạp lại giả định từ Cài đặt. Không có dữ liệu nào được ghi.");
              }}
            >
              Nạp lại từ Cài đặt
            </button>
          </section>

          {result && (
            <section className="card sim-result">
              <div className="row-between">
                <div>
                  <span className="metric-label">Tài sản cuối kỳ</span>
                  <div className="hero-money">{formatMoney(result.endWealthNominal)}</div>
                </div>
                <span className={`status-chip ${improves ? "green" : "yellow"}`}>{improves ? "Cải thiện" : "Cần xem lại"}</span>
              </div>
              <div className="sim-metrics">
                <div><span>Thực hôm nay</span><strong>{formatMoney(result.endWealthRealToday)}</strong></div>
                <div><span>Tăng thêm</span><strong>{formatMoney(result.endWealthNominal - result.contributed)}</strong></div>
                <div><span>Blended return</span><strong>{pct(result.blendedReturn)}</strong></div>
                <div><span>Độ phủ mục tiêu</span><strong>{Math.round(coverage)}%</strong></div>
              </div>
              <SparkLine values={chartValues} labels={chartLabels} />
              <div className="progress-track"><span style={{ width: `${coverage}%` }} /></div>
              <p className="story-caption">So với nhu cầu mục tiêu hiện tại, còn thiếu khoảng <strong>{formatMoney(scenarioGap)}</strong>.</p>
            </section>
          )}
        </>
      )}

      <p className="ov-foot">What-if chỉ là ước tính. Không phải tư vấn đầu tư và không ghi đè dữ liệu sổ.</p>
    </div>
  );
}
