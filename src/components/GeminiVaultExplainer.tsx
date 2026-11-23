import { useEffect, useMemo, useRef, useState } from "react";
import type { Goal } from "../lib/types";
import type { DisplayLocale } from "../ui/localeFormatting";
import { supabase } from "../lib/supabase";
import { classifyGeminiQuestion, geminiFactsForTopic, withSelectedGoal, type GeminiFacts, type GeminiTopic } from "../lib/geminiVaultFacts";
import { validExitDate } from "../lib/simulation/exitPlan";
import { clearGeminiAnswers, geminiAnswerCacheKey, readGeminiAnswer, readGeminiModel, saveGeminiAnswer } from "../lib/geminiVaultCache";
import "../styles/gemini-vault-explainer.css";

type Props = { locale: DisplayLocale; goals: readonly Goal[]; facts: GeminiFacts };
type Status = "unchecked" | "checking" | "ready" | "not_ready" | "sign_in" | "offline" | "loading" | "limit" | "error" | "answered";

const copy = {
  de: {
    tag: "Kostenlose KI · freiwillig", title: "Dein Sparplan, einfach erklärt",
    description: "Vault-Zahlen; keine Trades.",
    question: "Eigene Frage (optional)", input: "Frage zum Thema (optional)",
    topicPlan: "Mein Plan", topicYear: "Dieses Jahr", topicGoal: "Mein Ziel", topicSim: "Simulation",
    topicValue: "Depotwert", topicDifference: "Differenz", topicMonthly: "Monatsrate", topicGoalProgress: "Zielstand",
    goal: "Ziel auswählen", simGoal: "Ziel (optional)", noGoal: "Ziel auswählen",
    chooseGoal: "Bitte Ziel wählen. Ein genanntes Jahr genügt nicht.", noGoals:"Erstelle zuerst ein Ziel unter Ziele.",
    detected: "Frage erkannt als", unknownQuestion: "Frage nicht erkannt. Thema wählen oder Text löschen.",
    localTitle: "Vault · ohne KI-Limit", missing: "Daten fehlen im Vault.",
    valueSummary: "Depotwert: {value} (schwankend).",
    differenceSummary: "Depot {value}; Einzahlungen {paid}; Unterschied {difference}. Keine Jahresrendite.",
    monthlySummary: "Geplant: {monthly}/Monat; keine Zahlung bestätigt.",
    goalProgressSummary: "Depot {value}, Ziel {goal}: {progress}. Keine Garantie.",
    goalBelow: "Abstand {remaining}", goalReached: "Zielwert derzeit erreicht",
    personal: "Erfasst: {paid}. Depot: {value}. Monatsplan: {monthly}.",
    yearSummary: "Dieses Jahr: {recorded} erfasst, {planned} geplant. Kein Brokerbeleg.",
    yearAhead: "Beiträge erreichen den Planstand.", yearBehind: "Erfasste Beiträge liegen unter Plan.",
    goalSummary: "Ziel: {goal} bis {year}; kein Verkauf.",
    goalUnknown: "Kein Ziel gewählt; Jahr ist kein Verkaufstermin.",
    simSummary: "Szenarien bis {year}: {cautious}, {base}, {optimistic}. Keine Prognose.",
    simMissing: "Szenariodaten unvollständig.",
    check: "Verfügbarkeit prüfen", ask: "KI fragen", checking: "Prüfe...", loading: "Erkläre...",
    unchecked: "KI ungeprüft; Vault nutzbar.",
    notReady: "KI nicht bereit: Schlüssel oder Freigabe prüfen.",
    signIn: "Bitte im Vault anmelden.",
    offline: "Offline; Vault bleibt verfügbar.",
    ready: "KI bereit zum Fragen.",
    limited: "KI-Limit erreicht; morgen erneut versuchen.",
    error: "KI nicht erreichbar; Vault nutzbar.",
    unsupported: "Frage nicht unterstützt; Thema wählen.",
    aiAnswer: "Antwort von Gemini", modelLabel: "Modell", consent: "Ich erlaube, Summen an Gemini zu senden.",
    privacy: "Google kann Free-Tier-Inhalte zur Produktverbesserung nutzen. Keine Namen/Einzelbuchungen. Lokal gespeichert bis 24 h.",
    yearLabel:"Kalenderjahr", goalYearLabel:"Zieljahr", yearRecordedLabel:"Dieses Jahr erfasst", yearPlannedLabel:"Bis heute geplant",
    goalModeLabel:"Zielmodus", simYearLabel:"Szenariojahr", cautiousLabel:"Vorsichtig", baseLabel:"Basis", optimisticLabel:"Optimistisch",
    nominalLabel:"Nominal", purchasingLabel:"Kaufkraft", queryYearLabel:"Jahr in der Frage",
    data: "An Gemini gesendet", values: "Aktueller Depotwert", paid: "Erfasste Beiträge", monthly: "Sparrate", milestone: "Ziel",
    noData: "nicht verfügbar", disclaimer: "Keine Anlage-/Steuerberatung oder Renditegarantie.",
    quota: "20 Versuche/Person/UTC-Tag, auch bei Fehlern. Modellcheck ohne Vault-Versuch.",
    checkOk: "Key/Modell erreichbar; Antwort ungetestet.",
    checkKey: "Google: Zugriff verweigert (401/403).",
    checkModel: "Modelle nicht gefunden (404).",
    checkBusy: "Modellcheck nicht erreichbar.",
    checkUnknown: "Modellcheck fehlgeschlagen.",
    errKey: "Google lehnt Schlüssel/Zugriff ab.",
    errModel: "Google-Modell nicht gefunden.",
    errBadRequest: "Google: ungültige Anfrage (400).",
    errBusy: "Google überlastet (503).",
    errEmpty: "Leere KI-Antwort (Tokenlimit möglich).",
    errRejected: "Antwort aus Sicherheitsgründen verworfen.",
    errNetwork: "Google: Netzwerkfehler/Timeout.",
    limitNotice: "Nur Typ und Summen, nie dein Fragetext.",
    cached: "Geräte-Cache · kein neuer KI-Versuch.",
    cacheClear: "Gespeicherte KI-Antworten löschen", cacheCleared: "KI-Cache gelöscht.",
    sourceChecked: "Jahresplan, Differenz, Zielstand: nur Vault; kein KI-Limit.",
  },
  vi: {
    tag: "AI miễn phí · tự chọn", title: "Giải thích tiết kiệm",
    description: "AI giải thích sổ Vault; không giao dịch.",
    question: "Câu hỏi riêng (không bắt buộc)", input: "Hỏi về chủ đề đã chọn (tùy chọn)",
    topicPlan: "Kế hoạch", topicYear: "Năm nay", topicGoal: "Mục tiêu", topicSim: "Mô phỏng",
    topicValue: "Giá trị quỹ", topicDifference: "Chênh lệch", topicMonthly: "Góp tháng", topicGoalProgress: "Tiến độ Goal",
    goal: "Chọn Goal cần giải thích", simGoal: "Goal (tùy chọn)", noGoal: "Chọn Goal",
    chooseGoal: "Hãy chọn Goal trước khi hỏi Gemini; chỉ gõ năm là chưa đủ.", noGoals:"Hãy tạo Goal trong mục Mục tiêu trước.",
    detected: "Nhận diện câu hỏi", unknownQuestion: "Câu hỏi chưa rõ; chọn chủ đề hoặc xóa chữ.",
    localTitle: "Từ Vault · không trừ lượt", missing: "Chưa đủ dữ liệu trong sổ.",
    valueSummary: "Giá trị quỹ: {value} (có thể biến động).",
    differenceSummary: "Quỹ {value}; góp {paid}; lệch {difference}. Không là lợi suất năm.",
    monthlySummary: "Góp dự kiến {monthly}/tháng; chưa mua.",
    goalProgressSummary: "Quỹ {value} so với Goal {goal}: {progress}. Không bảo đảm.",
    goalBelow: "còn thiếu {remaining}", goalReached: "đang bằng hoặc vượt mốc",
    personal: "Đã ghi góp {paid}; quỹ hiện có {value}; kế hoạch tháng {monthly}.",
    yearSummary: "Năm nay ghi {recorded}, dự kiến {planned}. Chưa phải xác nhận broker.",
    yearAhead: "Theo giao dịch đã nhập, số góp đạt mức dự kiến tới hôm nay.", yearBehind: "Số góp ghi trong sổ còn thấp hơn kế hoạch tới hôm nay.",
    goalSummary: "Goal {goal}, năm {year}; không phải ngày bán.",
    goalUnknown: "Chưa chọn Goal; năm nhập không là ngày bán.",
    simSummary: "Mô phỏng đến {year}: {cautious}, {base}, {optimistic}; không bảo đảm.",
    simMissing: "Thiếu dữ liệu mô phỏng.",
    check: "Kiểm tra kết nối AI", ask: "Hỏi Gemini", checking: "Đang kiểm tra...", loading: "Đang giải thích...",
    unchecked: "Chưa kiểm tra AI; Vault vẫn dùng được.",
    notReady: "AI chưa sẵn sàng; kiểm tra server.",
    signIn: "Hãy đăng nhập để hỏi AI.",
    offline: "Ngoại tuyến; Vault vẫn hoạt động.",
    ready: "AI sẵn sàng để hỏi.",
    limited: "Hết lượt AI; thử lại ngày mai.",
    error: "AI lỗi; vẫn đọc được sổ.",
    unsupported: "Chưa hỗ trợ; hãy chọn chủ đề.",
    aiAnswer: "Gemini giải thích", modelLabel: "Mô hình", consent: "Tôi cho phép gửi số liệu tổng hợp tới Gemini khi hỏi mới.",
    privacy: "Google có thể dùng dữ liệu Free Tier để cải thiện sản phẩm. Không gửi tên/giao dịch lẻ. Lưu tối đa 24 giờ trên máy.",
    yearLabel:"Năm đang xét", goalYearLabel:"Năm của Goal", yearRecordedLabel:"Đã ghi trong năm", yearPlannedLabel:"Kế hoạch tới hôm nay",
    goalModeLabel:"Kiểu Goal", simYearLabel:"Năm mô phỏng", cautiousLabel:"Thận trọng", baseLabel:"Cơ sở", optimisticLabel:"Lạc quan",
    nominalLabel:"Danh nghĩa", purchasingLabel:"Sức mua", queryYearLabel:"Năm trong câu hỏi",
    data: "Các con số sẽ gửi", values: "Giá trị quỹ", paid: "Tổng đã góp", monthly: "Góp mỗi tháng", milestone: "Goal đã chọn",
    noData: "chưa có", disclaimer: "Không tư vấn đầu tư/thuế hay bảo đảm lợi nhuận.",
    quota: "Tối đa 20 lượt gửi/người/ngày UTC, kể cả lỗi. Kiểm tra model không trừ lượt Vault.",
    checkOk: "Key/model sẵn sàng; chưa thử trả lời.",
    checkKey: "Google từ chối key/quyền (401/403).",
    checkModel: "Không tìm thấy model (404).",
    checkBusy: "Không kiểm tra được model.",
    checkUnknown: "Chưa xác nhận trả lời.",
    errKey: "Google từ chối key/quyền.",
    errModel: "Không tìm thấy model.",
    errBadRequest: "Google từ chối yêu cầu (400).",
    errBusy: "Google đang quá tải (503).",
    errEmpty: "Phản hồi trống; có thể thiếu token.",
    errRejected: "Phản hồi bị từ chối vì an toàn.",
    errNetwork: "Google: mất kết nối/timeout.",
    limitNotice: "Chỉ gửi chủ đề và số tổng, không gửi chữ gõ.",
    cached: "Cache trên máy · không trừ lượt AI.",
    cacheClear: "Xóa cache AI", cacheCleared: "Đã xóa cache AI.",
    sourceChecked: "Năm nay, chênh lệch và tiến độ Goal do Vault tính; không gửi Google, không trừ lượt AI.",
  },
};
function formatEuro(n: number | null, locale: DisplayLocale, empty: string): string {
  return n === null ? empty : new Intl.NumberFormat(locale === "de" ? "de-DE" : "vi-VN",
    { style: "currency", currency: "EUR" }).format(n);
}
function fill(template: string, data: Record<string, string>): string {
  return template.replace(/\{([a-z]+)\}/g, (_whole, key: string) => data[key] ?? "—");
}
function fallback(topic: GeminiTopic, f: GeminiFacts, locale: DisplayLocale): string {
  const t = copy[locale];
  const euro = (n: number | null) => formatEuro(n, locale, t.noData);
  if (topic === "year") {
    if (f.yearRecorded === null || f.yearPlanned === null) return t.missing;
    return fill(t.yearSummary,{recorded:euro(f.yearRecorded),planned:euro(f.yearPlanned)})
      + " " + (f.yearRecorded >= f.yearPlanned ? t.yearAhead : t.yearBehind);
  }
  if (topic === "monthly") return f.monthly !== null
    ? fill(t.monthlySummary, { monthly:euro(f.monthly) }) : t.missing;
  if (topic === "value") return f.portfolioValue !== null
    ? fill(t.valueSummary, { value:euro(f.portfolioValue) }) : t.missing;
  if (topic === "difference") {
    if (f.portfolioValue === null || f.contributed === null) return t.missing;
    const cents = Math.round(f.portfolioValue * 100) - Math.round(f.contributed * 100);
    return fill(t.differenceSummary, {
      value:euro(f.portfolioValue), paid:euro(f.contributed),
      difference:(cents > 0 ? "+" : "") + euro(cents / 100),
    });
  }
  if (topic === "goalProgress") {
    if (!f.goalYear || f.goalAmount === null || f.goalAmount <= 0) return t.goalUnknown;
    if (f.portfolioValue === null) return t.missing;
    const gapCents = Math.round(f.goalAmount * 100) - Math.round(f.portfolioValue * 100);
    return fill(t.goalProgressSummary, {
      value:euro(f.portfolioValue), goal:euro(f.goalAmount),
      progress:gapCents > 0
        ? fill(t.goalBelow,{remaining:euro(gapCents / 100)}) : t.goalReached,
    });
  }
  if (topic === "goal") return f.goalYear && f.goalAmount !== null
    ? fill(t.goalSummary, { year: String(f.goalYear), goal: euro(f.goalAmount) }) : t.goalUnknown;
  if (topic === "simulation") return f.cautious !== null && f.base !== null && f.optimistic !== null && f.simulationYear
    ? fill(t.simSummary, { cautious:euro(f.cautious), base:euro(f.base),
        optimistic:euro(f.optimistic), year:String(f.simulationYear) }) : t.simMissing;
  if (f.contributed === null && f.portfolioValue === null) return t.missing;
  const summary = fill(t.personal,{paid:euro(f.contributed),value:euro(f.portfolioValue),monthly:euro(f.monthly)});
  if (topic === "plan" && f.yearRecorded !== null && f.yearPlanned !== null) {
    const yearText = fill(t.yearSummary,{recorded:euro(f.yearRecorded),planned:euro(f.yearPlanned)});
    const gap = Math.round(f.yearPlanned * 100) - Math.round(f.yearRecorded * 100);
    const shortfall = gap > 0 ? (locale === "vi"
      ? ` Còn thiếu ${euro(gap / 100)} theo sổ.`
      : ` Im Vault fehlen ${euro(gap / 100)}.`) : "";
    const valueGap = f.portfolioValue !== null && f.contributed !== null
      ? " " + fallback("difference",f,locale) : "";
    return summary + " " + yearText + " "
      + (gap <= 0 ? t.yearAhead : t.yearBehind) + shortfall + valueGap;
  }
  return summary;
}

export default function GeminiVaultExplainer({ locale, goals, facts }: Props) {
  const t = copy[locale];
  const [goalId, setGoalId] = useState("");
  const [topic, setTopic] = useState<GeminiTopic>("plan");
  const [question, setQuestion] = useState("");
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<Status>(supabase ? "unchecked" : "not_ready");
  const [answer, setAnswer] = useState("");
  const [answerModel, setAnswerModel] = useState<string | null>(null);
  const [cached, setCached] = useState(false);
  const asking = useRef(false);
  const [diagnostic, setDiagnostic] = useState("");
  const [remaining, setRemaining] = useState<number | null>(null);
  const [limitPerDay, setLimitPerDay] = useState(20);
  const chosenGoal = goals.find(g => !g.deletedAt && g.id === goalId && validExitDate(g.dueDate)) ?? null;
  const query = question.trim() ? classifyGeminiQuestion(question) : { topic, queryYear: null };
  const localTopic: GeminiTopic = query?.topic ?? topic;
  const ledgerOnly = localTopic === "year" || localTopic === "difference" || localTopic === "goalProgress";
  const needsGoal = localTopic === "goal" || localTopic === "goalProgress";
  const showGoal = needsGoal || localTopic === "simulation";
  // Keep a manually selected Goal in UI state, but do not send its data to
  // unrelated topics. Goal fields are absent even after a prior Goal question.
  const selectedFacts = useMemo(() => withSelectedGoal(facts, showGoal ? chosenGoal : null),
    [facts, chosenGoal, showGoal]);
  const goalMissing = localTopic === "goal" && !chosenGoal;
  const scopedFacts = useMemo(() => geminiFactsForTopic(selectedFacts, localTopic), [selectedFacts, localTopic]);
  const topicLabels: Record<GeminiTopic,string> = {
    plan:t.topicPlan,year:t.topicYear,goal:t.topicGoal,simulation:t.topicSim,
    value:t.topicValue,difference:t.topicDifference,monthly:t.topicMonthly,goalProgress:t.topicGoalProgress,
  };
  const answerContext = JSON.stringify([locale, query?.topic, query?.queryYear, scopedFacts]);
  const contextRef = useRef(answerContext);
  contextRef.current = answerContext;
  useEffect(() => { setAnswer(""); setCached(false); setAnswerModel(null); }, [answerContext]);
  useEffect(() => {
    const listener = supabase?.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT" || event === "SIGNED_IN") {
        setAnswer(""); setCached(false); setAnswerModel(null); setConsent(false);
        setDiagnostic(""); setRemaining(null); setStatus("unchecked");
      }
    });
    return () => listener?.data.subscription.unsubscribe();
  }, []);

  const local = fallback(localTopic, selectedFacts, locale);
  const money = (n: number | null): string | null => n === null ? null : formatEuro(n, locale, t.noData);
  const outgoingRows = ([
    [t.values, money(scopedFacts.portfolioValue)],
    [t.paid, money(scopedFacts.contributed)],
    [t.monthly, money(scopedFacts.monthly)],
    [t.yearLabel, scopedFacts.year],
    [t.yearRecordedLabel, money(scopedFacts.yearRecorded)],
    [t.yearPlannedLabel, money(scopedFacts.yearPlanned)],
    [t.milestone, money(scopedFacts.goalAmount)],
    [t.goalYearLabel, scopedFacts.goalYear],
    [t.goalModeLabel, scopedFacts.goalMode === null ? null : scopedFacts.goalMode === "nominal" ? t.nominalLabel : t.purchasingLabel],
    [t.simYearLabel, scopedFacts.simulationYear],
    [t.cautiousLabel, money(scopedFacts.cautious)],
    [t.baseLabel, money(scopedFacts.base)],
    [t.optimisticLabel, money(scopedFacts.optimistic)],
    [t.queryYearLabel, query?.queryYear ?? null],
  ] as Array<[string, string | number | null]>).filter(([,value]) => value !== null);
  const hasTyped = question.trim().length > 0;
  const busy = status === "loading" || status === "checking";
  const showStatus = ({
    unchecked:t.unchecked,checking:t.checking,ready:t.ready,not_ready:t.notReady,
    sign_in:t.signIn,offline:t.offline,loading:t.loading,limit:t.limited,
    error:t.error,answered:t.ready,
  })[status];

  async function connectionCheck(): Promise<boolean> {
    setAnswer(""); setCached(false); setAnswerModel(null);
    setDiagnostic("");
    if (!supabase) { setStatus("not_ready"); return false; }
    if (typeof navigator !== "undefined" && !navigator.onLine) { setStatus("offline"); return false; }
    setStatus("checking");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setStatus("sign_in"); return false; }
      const { data, error } = await supabase.functions.invoke("gemini-vault-explain", {
        method:"GET", headers: { "x-gemini-check": "1" },
      });
      if (error || !data) { setStatus("not_ready"); return false; }
      if (Number.isInteger(data.limitPerDay) && data.limitPerDay > 0 && data.limitPerDay <= 40) setLimitPerDay(data.limitPerDay);
      if (Number.isInteger(data.remaining)) setRemaining(data.remaining);
      const checks: Array<{status?: number | null}> = Array.isArray(data.modelChecks) ? data.modelChecks : [];
      const codes = checks.map(item => item?.status);
      if (codes.includes(200)) setDiagnostic(t.checkOk);
      else if (codes.includes(401) || codes.includes(403)) setDiagnostic(t.checkKey);
      else if (codes.length > 0 && codes.every(code => code === 404)) setDiagnostic(t.checkModel);
      else if (codes.length > 0) setDiagnostic(t.checkBusy);
      else setDiagnostic(t.checkUnknown);
      if (data.ready !== true) { setStatus("not_ready"); return false; }
      setStatus("ready"); return true;
    } catch { setStatus("not_ready"); return false; }
  }
  async function ask(): Promise<void> {
    if (asking.current || busy || ledgerOnly || goalMissing || !consent) return;
    asking.current = true; // A double-tap must not spend two Vault quota claims.
    const context = answerContext;
    try {
      if (!query) { setStatus("error"); setAnswer(t.unsupported); return; }
      if (!supabase) { setStatus("not_ready"); return; }
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) { setStatus("sign_in"); return; }
      const body = { schemaVersion:1, locale, topic:query.topic, queryYear:query.queryYear, facts:scopedFacts };
      const key = await geminiAnswerCacheKey(session.user.id, body);
      const saved = key && readGeminiAnswer(key);
      if (context !== contextRef.current) return;
      if (saved) {
        setAnswer(saved); setAnswerModel(key ? readGeminiModel(key) : null); setCached(true); setDiagnostic(t.cached); setStatus("answered");
        return; // No readiness probe, server quota claim or Google request.
      }
      if (typeof navigator !== "undefined" && !navigator.onLine) { setStatus("offline"); return; }
      const ready = status === "ready" || status === "answered";
      if (!ready && !(await connectionCheck())) return;
      if (context !== contextRef.current) return;
      setAnswer(""); setCached(false); setAnswerModel(null); setStatus("loading");
      try {
        const { data, error } = await supabase.functions.invoke("gemini-vault-explain", {
          method: "POST", body,
        });
        if (context !== contextRef.current) return;
        if (error) {
          // Read only our fixed response code, never Google's raw error body.
          const ctx = (error as unknown as { context?: Response }).context;
          let result: { code?: string; remaining?: number } = {};
          try {
            if (ctx && typeof ctx.clone === "function") {
              const parsed: unknown = await ctx.clone().json();
              if (parsed && typeof parsed === "object") result = parsed as typeof result;
            }
          } catch { /* network or legacy response */ }
          if (Number.isInteger(result.remaining)) setRemaining(result.remaining!);
          const message = ({
            GOOGLE_KEY_INVALID:t.errKey, GOOGLE_ACCESS_DENIED:t.errKey,
            GOOGLE_MODEL_NOT_FOUND:t.errModel, GOOGLE_BAD_REQUEST:t.errBadRequest,
            GOOGLE_OVERLOADED:t.errBusy, AI_EMPTY_OUTPUT:t.errEmpty,
            AI_RESPONSE_REJECTED:t.errRejected, GOOGLE_NETWORK_ERROR:t.errNetwork,
          } as Record<string,string>)[result.code ?? ""];
          setDiagnostic(message || (ctx?.status === 429 ? t.limited : t.error));
          setStatus(ctx?.status === 429 ? "limit" : "error");
          return;
        }
        if (!data || typeof data.explanation !== "string" || !data.explanation.trim()) {
          setStatus("error"); return;
        }
        const clean = data.explanation.trim().slice(0,800);
        setAnswer(clean);
        const model = data.model === "gemini-3.8-flash" || data.model === "gemini-3.5-flash-lite" ? data.model : null;
        setAnswerModel(model);
        setDiagnostic("");
        setRemaining(Number.isInteger(data.remaining) ? data.remaining : null);
        setStatus("answered");
        if (key && model) saveGeminiAnswer(key, clean, model); // Cache model label alongside successful explanations.
      } catch { if (context === contextRef.current) setStatus("error"); }
    } catch { if (context === contextRef.current) setStatus("error"); }
    finally { asking.current = false; }
  }
  function clearCache(): void {
    clearGeminiAnswers(); setAnswer(""); setCached(false); setAnswerModel(null);
    setDiagnostic(t.cacheCleared); setStatus("unchecked");
  }

  return <section className="gl gemini-vault" data-testid="gemini-vault-explainer" aria-labelledby="gemini-vault-title">
    <header><small>{t.tag}</small><h2 id="gemini-vault-title">{t.title}</h2><p>{t.description}</p></header>
    <div className="gemini-vault-suggestions" role="group" aria-label={t.question}>
      {(["plan","year","goal","simulation","value","difference","monthly","goalProgress"] as const).map(v=><button key={v} type="button"
        aria-pressed={localTopic===v} onClick={()=>{setTopic(v);setQuestion("");setAnswer("");}}>
        {topicLabels[v]}
      </button>)}
    </div>
    {showGoal && <>
      <label htmlFor="gemini-vault-goal">{localTopic === "simulation" ? t.simGoal : t.goal}</label>
      <select id="gemini-vault-goal" value={goalId} onChange={e=>{setGoalId(e.target.value);setAnswer("");}}>
        <option value="">{t.noGoal}</option>
        {goals.filter(g=>!g.deletedAt&&validExitDate(g.dueDate)).map(g=><option key={g.id} value={g.id}>{g.name} · {g.dueDate}</option>)}
      </select>
      {goalMissing && <p className="gemini-vault-hint" role="status">{goals.some(g=>!g.deletedAt&&validExitDate(g.dueDate)) ? t.chooseGoal : t.noGoals}</p>}
    </>}
    <label htmlFor="gemini-vault-question">{t.question}</label>
    <input id="gemini-vault-question" value={question} maxLength={160} placeholder={t.input}
      onChange={e=>{setQuestion(e.target.value);setAnswer("");}} />
    {hasTyped && query && query.topic !== topic && <p className="gemini-vault-hint" role="status">
      {t.detected}: <strong>{topicLabels[query.topic]}</strong>
    </p>}
    {hasTyped && !query && <p className="gemini-vault-hint" role="status">{t.unknownQuestion}</p>}
    <p className="gemini-vault-hint">{t.limitNotice}</p>
    <div className="gemini-vault-local">
      <h3>{t.localTitle}</h3><p>{local}</p>
      {ledgerOnly && <small>{t.sourceChecked}</small>}
    </div>
    {!ledgerOnly && !goalMissing && <>
    <div className="gemini-vault-payload">
      <h3>{t.data}</h3>
      <dl>
        {outgoingRows.length ? outgoingRows.map(([label,value])=>
          <div key={label}><dt>{label}</dt><dd>{value}</dd></div>) : <div><dt>{t.noData}</dt></div>}
      </dl>
    </div>
    <p className="gemini-vault-privacy">{t.privacy}</p>
    <label className="gemini-vault-consent"><input type="checkbox" checked={consent}
      onChange={e=>setConsent(e.target.checked)} /> <span>{t.consent}</span></label>
    <div className="gemini-vault-actions">
      <button type="button" disabled={busy || !supabase} onClick={()=>void connectionCheck()}>{busy ? t.checking : t.check}</button>
      <button type="button" disabled={busy || goalMissing || !consent || !query || !supabase}
        onClick={()=>void ask()}>{status==="loading"?t.loading:t.ask}</button>
    </div>
    <p className="gemini-vault-status" role={status === "unchecked" || status === "not_ready" ? undefined : "status"}>{showStatus}</p>
    {diagnostic && <p className="gemini-vault-status" role="status">{diagnostic}</p>}
    {remaining !== null && <p className="gemini-vault-status">{locale === "de"
      ? `Heute wurden ${Math.max(0,limitPerDay - remaining)}/${limitPerDay} Sendeversuche im Vault verbraucht.`
      : `Đã dùng ${Math.max(0,limitPerDay - remaining)}/${limitPerDay} lượt thử hôm nay trong Vault.`}</p>}
    {answer && <div className="gemini-vault-answer"><strong>{t.aiAnswer}</strong>
      {answerModel && <small className="gemini-vault-model" data-testid="gemini-vault-model">{t.modelLabel}: {answerModel === "gemini-3.8-flash" ? "Flash" : "Flash-Lite"}</small>}
      <p>{answer}</p>
      {cached && <button type="button" onClick={clearCache}>{t.cacheClear}</button>}


    </div>}
    </>}
    <p className="gemini-vault-disclaimer">{t.disclaimer} {t.quota}</p>
  </section>;
}
