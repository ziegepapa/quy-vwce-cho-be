import { useMemo, useState } from "react";
import type { Goal } from "../lib/types";
import type { DisplayLocale } from "../ui/localeFormatting";
import { supabase } from "../lib/supabase";
import { classifyGeminiQuestion, withSelectedGoal, type GeminiFacts, type GeminiTopic } from "../lib/geminiVaultFacts";
import { validExitDate } from "../lib/simulation/exitPlan";
import "../styles/gemini-vault-explainer.css";

type Props = { locale: DisplayLocale; goals: readonly Goal[]; facts: GeminiFacts };
type Status = "unchecked" | "checking" | "ready" | "not_ready" | "sign_in" | "offline" | "loading" | "limit" | "error" | "answered";

const copy = {
  de: {
    tag: "Kostenlose KI · freiwillig", title: "Dein Sparplan, einfach erklärt",
    description: "Die Zahlen aus deinem Vault werden nur erklärt. Es wird nichts gekauft, verkauft oder gespeichert.",
    question: "Kurze Frage", input: "Zum Beispiel: Habe ich dieses Jahr genug eingezahlt?",
    topicPlan: "Mein Plan", topicYear: "Dieses Jahr", topicGoal: "Mein Ziel", topicSim: "Simulation",
    goal: "Welches Ziel möchtest du besprechen?", noGoal: "Kein Ziel ausgewählt",
    localTitle: "Auch ohne KI verständlich", missing: "Dazu fehlen noch Zahlen im Vault.",
    personal: "Im Vault sind bisher {paid} eingetragen. Der aktuelle Wert ist {value}. Der monatliche Sparplan beträgt {monthly}.",
    yearSummary: "Dieses Jahr sind {recorded} erfasst. Bis heute waren {planned} laut Plan vorgesehen. Das ist keine Bestätigung durch den Broker.",
    yearAhead: "Die eingetragenen Beiträge erreichen den Planstand bis heute.", yearBehind: "Die eingetragenen Beiträge liegen unter dem Planstand bis heute.",
    goalSummary: "Das gewählte Ziel liegt im Jahr {year}; als Betrag stehen {goal} im Vault. Das ist kein fester Verkaufstermin.",
    goalUnknown: "Es wurde noch kein Ziel ausgewählt. Ein genanntes Jahr ist keine automatisch festgelegte Auszahlung.",
    simSummary: "Die drei Rechenbeispiele zeigen {cautious}, {base} und {optimistic} bis {year}. Das sind Annahmen, keine Zusage.",
    simMissing: "Die Rechenbeispiele sind derzeit nicht vollständig verfügbar.",
    check: "Verfügbarkeit prüfen", ask: "KI fragen", checking: "Prüfe...", loading: "Erkläre...",
    unchecked: "Noch nicht geprüft. Die Erklärung aus dem Vault funktioniert auch ohne KI.",
    notReady: "KI noch nicht bereit: Funktion, Schlüssel oder Serverfreigabe fehlen.",
    signIn: "Bitte erst im Vault anmelden. Die KI braucht eine gültige Sitzung.",
    offline: "Keine Verbindung. Die Erklärung aus dem Vault bleibt sichtbar.",
    ready: "KI ist bereit. Du kannst bewusst eine Frage senden.",
    limited: "Heute sind die kostenlosen KI-Anfragen aufgebraucht. Bitte morgen erneut versuchen.",
    error: "Die KI ist gerade nicht erreichbar. Nutze die Erklärung aus deinem Vault.",
    unsupported: "Diese Frage kann die KI hier nicht sicher beantworten. Bitte eine der kurzen Beispielfragen wählen.",
    aiAnswer: "Antwort von Gemini", consent: "Ich bin einverstanden, dass die unten gezeigten Zahlen zur Erklärung an Google Gemini geschickt werden.",
    privacy: "Wichtig: Im kostenlosen Google-Tarif können gesendete Inhalte verwendet werden, um Google-Produkte zu verbessern. Keine Namen, Kontonummern oder einzelnen Buchungen übertragen.",
    data: "Diese Angaben würden gesendet", values: "Aktueller Depotwert", paid: "Erfasste Beiträge", monthly: "Monatsbeitrag", milestone: "Gewähltes Ziel",
    noData: "nicht verfügbar", disclaimer: "Nur allgemeine Erläuterung — keine Anlage- oder Steuerberatung. Keine Renditegarantie.",
    quota: "Maximal zehn Sendeversuche je Person und UTC-Tag, auch bei Fehlern. Der Modellcheck verbraucht keinen Vault-Versuch.",
    checkOk: "Schlüssel und Modellmetadaten sind erreichbar. Eine Textgenerierung wurde noch nicht getestet.",
    checkKey: "Google hat den API-Schlüssel zurückgewiesen oder den Zugriff verweigert (401/403).",
    checkModel: "Keines der beiden Modelle ist mit diesem Schlüssel verfügbar (404).",
    checkBusy: "Google ist beim Modellcheck gerade nicht erreichbar. Bitte später erneut prüfen.",
    checkUnknown: "Der Modellcheck ist nicht verfügbar; die Textgenerierung ist noch nicht bestätigt.",
    errKey: "Google lehnt den Schlüssel oder die Berechtigung ab.",
    errModel: "Das angeforderte Google-Modell wurde nicht gefunden.",
    errBadRequest: "Google hat die Anfrage abgelehnt (400); Modellparameter prüfen.",
    errBusy: "Google meldet Überlastung/temporäre Nichtverfügbarkeit (503).",
    errEmpty: "Google antwortete ohne nutzbaren Text; das Ausgabelimit könnte die Ursache sein.",
    errRejected: "Die KI-Antwort wurde aus Sicherheitsgründen nicht angezeigt.",
    errNetwork: "Zeitüberschreitung oder Netzwerkfehler bei Google.",
    limitNotice: "Zum Antworten werden nur feste Fragetypen und die Zahlen unten gesendet, nie dein freier Fragetext.",
  },
  vi: {
    tag: "AI miễn phí · tự chọn", title: "Giải thích kế hoạch bằng lời thường",
    description: "AI chỉ giúp hiểu các con số đã ghi trong Vault, không tạo giao dịch hay lưu câu hỏi.",
    question: "Hỏi ngắn", input: "Ví dụ: Năm nay tôi góp đủ chưa?",
    topicPlan: "Kế hoạch", topicYear: "Năm nay", topicGoal: "Mục tiêu", topicSim: "Mô phỏng",
    goal: "Bạn muốn hỏi về Goal nào?", noGoal: "Chưa chọn Goal",
    localTitle: "Không có AI vẫn hiểu được", missing: "Hiện chưa đủ dữ liệu trong sổ để giải thích chi tiết.",
    personal: "Sổ đã ghi nhận {paid} góp vào quỹ. Giá trị hiện tại {value}. Mức góp theo kế hoạch là {monthly}.",
    yearSummary: "Năm nay đã ghi {recorded}; kế hoạch tới hôm nay là {planned}. Đây không phải xác nhận từ broker.",
    yearAhead: "Theo giao dịch đã nhập, số góp đạt mức dự kiến tới hôm nay.", yearBehind: "Số góp ghi trong sổ còn thấp hơn kế hoạch tới hôm nay.",
    goalSummary: "Goal do bạn chọn là năm {year} với số tiền {goal}. Đây không phải ngày bán cố định.",
    goalUnknown: "Chưa chọn Goal. Năm trong câu hỏi không tự thành ngày cần bán.",
    simSummary: "Ba kịch bản mô phỏng lần lượt là {cautious}, {base} và {optimistic} tới {year}. Đây là giả định, không phải lời hứa.",
    simMissing: "Chưa đủ dữ liệu mô phỏng để tóm tắt.",
    check: "Kiểm tra kết nối AI", ask: "Hỏi Gemini", checking: "Đang kiểm tra...", loading: "Đang giải thích...",
    unchecked: "Chưa kiểm tra AI. Phần giải thích từ sổ vẫn dùng được.",
    notReady: "AI chưa sẵn sàng: chưa cấp key, chưa bật hoặc chưa triển khai lên máy chủ.",
    signIn: "Hãy đăng nhập Vault trước khi dùng AI.",
    offline: "Mất mạng. Phần giải thích từ sổ vẫn hiển thị.",
    ready: "AI đã sẵn sàng. Bạn có thể chủ động gửi câu hỏi.",
    limited: "Hôm nay đã hết lượt AI miễn phí. Hãy thử lại ngày mai.",
    error: "AI chưa dùng được lúc này. Hãy xem phần giải thích từ sổ.",
    unsupported: "Câu hỏi này chưa được hỗ trợ an toàn. Hãy chọn một câu hỏi mẫu.",
    aiAnswer: "Gemini giải thích", consent: "Tôi đồng ý gửi các con số tổng hợp dưới đây tới Google Gemini để giải thích.",
    privacy: "Lưu ý: Google có thể dùng nội dung gửi qua bản miễn phí để cải thiện sản phẩm. Không gửi tên, mã tài khoản hay từng giao dịch.",
    data: "Các con số sẽ gửi", values: "Giá trị quỹ", paid: "Tổng đã góp", monthly: "Góp mỗi tháng", milestone: "Goal đã chọn",
    noData: "chưa có", disclaimer: "Chỉ là thông tin chung, không tư vấn đầu tư/thuế và không hứa lợi nhuận.",
    quota: "Tối đa 10 lượt gửi/người/ngày UTC, kể cả lượt lỗi. Kiểm tra key/model không trừ lượt trong Vault.",
    checkOk: "Key và thông tin model truy cập được. Chưa kiểm thử tạo câu trả lời.",
    checkKey: "Google từ chối key hoặc quyền truy cập (401/403).",
    checkModel: "Không tìm thấy hai model với key hiện tại (404).",
    checkBusy: "Google tạm không phản hồi khi kiểm tra model. Hãy thử lại sau.",
    checkUnknown: "Chưa kiểm tra được model; không thể xác nhận chức năng trả lời.",
    errKey: "Google từ chối API key hoặc quyền truy cập.",
    errModel: "Google không tìm thấy model được yêu cầu.",
    errBadRequest: "Google từ chối tham số yêu cầu (400).",
    errBusy: "Máy chủ Google đang quá tải hoặc tạm không khả dụng (503).",
    errEmpty: "Google trả về nội dung rỗng; có thể do giới hạn token.",
    errRejected: "Nội dung AI trả về không đạt kiểm tra an toàn nên không hiển thị.",
    errNetwork: "Kết nối tới Google bị lỗi hoặc hết thời gian.",
    limitNotice: "Chỉ loại câu hỏi và số liệu tổng hợp được gửi; nguyên văn câu hỏi bạn gõ sẽ không gửi đi.",
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
    return t.yearSummary.replace("{recorded}", euro(f.yearRecorded)).replace("{planned}", euro(f.yearPlanned))
      + " " + (f.yearRecorded >= f.yearPlanned ? t.yearAhead : t.yearBehind);
  }
  if (topic === "goal") return f.goalYear && f.goalAmount !== null
    ? fill(t.goalSummary, { year: String(f.goalYear), goal: euro(f.goalAmount) }) : t.goalUnknown;
  if (topic === "simulation") return f.cautious !== null && f.base !== null && f.optimistic !== null && f.simulationYear
    ? fill(t.simSummary, { cautious:euro(f.cautious), base:euro(f.base),
        optimistic:euro(f.optimistic), year:String(f.simulationYear) }) : t.simMissing;
  if (f.contributed === null && f.portfolioValue === null) return t.missing;
  return fill(t.personal,{paid:euro(f.contributed),value:euro(f.portfolioValue),monthly:euro(f.monthly)});
}

export default function GeminiVaultExplainer({ locale, goals, facts }: Props) {
  const t = copy[locale];
  const [goalId, setGoalId] = useState("");
  const [topic, setTopic] = useState<GeminiTopic>("plan");
  const [question, setQuestion] = useState("");
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<Status>(supabase ? "unchecked" : "not_ready");
  const [answer, setAnswer] = useState("");
  const [diagnostic, setDiagnostic] = useState("");
  const [remaining, setRemaining] = useState<number | null>(null);
  const chosenGoal = goals.find(g => !g.deletedAt && g.id === goalId && validExitDate(g.dueDate)) ?? null;
  const selectedFacts = useMemo(() => withSelectedGoal(facts, chosenGoal), [facts, chosenGoal]);
  const query = question.trim() ? classifyGeminiQuestion(question) : { topic, queryYear: null };
  const localTopic: GeminiTopic = query?.topic ?? topic;
  const local = fallback(localTopic, selectedFacts, locale);
  const busy = status === "loading" || status === "checking";
  const showStatus = ({
    unchecked:t.unchecked,checking:t.checking,ready:t.ready,not_ready:t.notReady,
    sign_in:t.signIn,offline:t.offline,loading:t.loading,limit:t.limited,
    error:t.error,answered:t.ready,
  })[status];

  async function connectionCheck(): Promise<boolean> {
    setAnswer("");
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
    if (busy || !consent) return;
    if (!query) { setStatus("error"); setAnswer(t.unsupported); return; }
    if (!supabase) { setStatus("not_ready"); return; }
    if (typeof navigator !== "undefined" && !navigator.onLine) { setStatus("offline"); return; }
    const ready = status === "ready" || status === "answered";
    if (!ready && !(await connectionCheck())) return;
    setAnswer(""); setStatus("loading");
    try {
      const { data, error } = await supabase.functions.invoke("gemini-vault-explain", {
        method: "POST",
        body: { schemaVersion:1, locale, topic:query.topic, queryYear:query.queryYear, facts:selectedFacts },
      });
      if (error) {
        // Supabase returns a Response in FunctionsHttpError.context; parse only
        // our fixed, non-sensitive error code. Never display Google's raw body.
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
      setAnswer(data.explanation.trim().slice(0,800));
      setRemaining(Number.isInteger(data.remaining) ? data.remaining : null);
      setStatus("answered");
    } catch { setStatus("error"); }
  }

  return <section className="gl gemini-vault" data-testid="gemini-vault-explainer" aria-labelledby="gemini-vault-title">
    <header><small>{t.tag}</small><h2 id="gemini-vault-title">{t.title}</h2><p>{t.description}</p></header>
    <div className="gemini-vault-local">
      <h3>{t.localTitle}</h3><p>{local}</p>
    </div>
    <label htmlFor="gemini-vault-goal">{t.goal}</label>
    <select id="gemini-vault-goal" value={goalId} onChange={e=>{setGoalId(e.target.value);setAnswer("");}}>
      <option value="">{t.noGoal}</option>
      {goals.filter(g=>!g.deletedAt&&validExitDate(g.dueDate)).map(g=><option key={g.id} value={g.id}>{g.name} · {g.dueDate}</option>)}
    </select>
    <div className="gemini-vault-suggestions" role="group" aria-label={t.question}>
      {(["plan","year","goal","simulation"] as const).map(v=><button key={v} type="button"
        aria-pressed={topic===v} onClick={()=>{setTopic(v);setQuestion("");setAnswer("");}}>
        {({plan:t.topicPlan,year:t.topicYear,goal:t.topicGoal,simulation:t.topicSim})[v]}
      </button>)}
    </div>
    <label htmlFor="gemini-vault-question">{t.question}</label>
    <input id="gemini-vault-question" value={question} maxLength={160} placeholder={t.input}
      onChange={e=>{setQuestion(e.target.value);setAnswer("");}} />
    <p className="gemini-vault-hint">{t.limitNotice}</p>
    <div className="gemini-vault-payload">
      <h3>{t.data}</h3>
      <dl>
        <div><dt>{t.values}</dt><dd>{formatEuro(selectedFacts.portfolioValue,locale,t.noData)}</dd></div>
        <div><dt>{t.paid}</dt><dd>{formatEuro(selectedFacts.contributed,locale,t.noData)}</dd></div>
        <div><dt>{t.monthly}</dt><dd>{formatEuro(selectedFacts.monthly,locale,t.noData)}</dd></div>
        <div><dt>{t.milestone}</dt><dd>{selectedFacts.goalYear || t.noData}</dd></div>
      </dl>
    </div>
    <p className="gemini-vault-privacy">{t.privacy}</p>
    <label className="gemini-vault-consent"><input type="checkbox" checked={consent}
      onChange={e=>setConsent(e.target.checked)} /> <span>{t.consent}</span></label>
    <div className="gemini-vault-actions">
      <button type="button" disabled={busy || !supabase} onClick={()=>void connectionCheck()}>{busy ? t.checking : t.check}</button>
      <button type="button" disabled={busy || !consent || !query || !supabase}
        onClick={()=>void ask()}>{status==="loading"?t.loading:t.ask}</button>
    </div>
    <p className="gemini-vault-status" role={status === "unchecked" || status === "not_ready" ? undefined : "status"}>{showStatus}</p>
    {diagnostic && <p className="gemini-vault-status" role="status">{diagnostic}</p>}
    {remaining !== null && <p className="gemini-vault-status">{locale === "de"
      ? `Heute wurden ${10 - remaining}/10 Sendeversuche im Vault verbraucht.`
      : `Đã dùng ${10 - remaining}/10 lượt thử hôm nay trong Vault.`}</p>}
    {answer && <div className="gemini-vault-answer"><strong>{t.aiAnswer}</strong><p>{answer}</p>

    </div>}
    <p className="gemini-vault-disclaimer">{t.disclaimer} {t.quota}</p>
  </section>;
}
