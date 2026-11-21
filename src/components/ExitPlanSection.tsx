import { useState } from "react";
import type { Goal } from "../lib/types";
import type { DisplayLocale } from "../ui/localeFormatting";
import { buildExitInstallments, monthsBefore, parseIllustrationBudgetCents, validExitDate, type ExitWindowMonths, type ReviewHorizonYears } from "../lib/simulation/exitPlan";
import "../styles/simulation-exit-plan.css";

type Props = { goals: readonly Goal[]; locale: DisplayLocale };
const copy = {
  de: {
    heading: "Auszahlungsplan", tag: "Nur Simulation",
    intro: "Planen Sie eine mögliche Auszahlung anhand Ihrer eigenen Eingaben. Hier wird nichts gehandelt oder gespeichert.",
    goal: "Ziel auswählen", goalHelp: "Wählen Sie ein vorhandenes Ziel aus „Ziele“. Ohne Ihre Auswahl bleibt die Planung leer.",
    select: "Mein Ziel", none: "Noch kein Ziel ausgewählt", noGoals: "Legen Sie zuerst unter „Ziele“ ein zukünftiges Ziel an. Ein Beispieldatum wird nicht eingesetzt.",
    date: "Verwendungsdatum", target: "Zielbetrag (kein Verkaufsbetrag)", protected: "Bereits geschützt",
    purchasing: "Kaufkraft im Basisjahr", notSale: "— kein künftiger Verkaufserlös.",
    risk: "Risiko prüfen", riskHelp: "Prüfen Sie mögliche Verluste rechtzeitig vor dem Ziel. Es gibt hier keine Vorgabe für Aktienquoten.",
    from: "Risiko prüfen ab", until: "Ziel", future: "Langfristig",
    sale: "Rechnerische Etappen", saleHelp: "Mehrere Termine können das Tagesrisiko verteilen, sichern aber keinen besseren Preis. Die Beträge sind nur Ihr Rechenbeispiel.",
    budget: "Selbst gewählter Modellbetrag in EUR", noBudget: "Kein Betrag eingetragen",
    budgetHelp: "Keine Schätzung aus Depot oder Ziel; bereits geschütztes Geld wird nicht automatisch abgezogen.",
    invalid: "Bitte einen positiven Eurobetrag mit höchstens zwei Nachkommastellen eingeben.",
    past: "Das Fenster beginnt in der Vergangenheit. Prüfen Sie Ziel oder Zeitraum.",
    empty: "Noch keine Verkaufsetappen. Erst Ziel wählen, dann Modellbetrag eingeben.",
    stage: "Etappe", amount: "Modellbetrag", remaining: "Restbudget",
    remainingHelp: "Restbudget ist nur Ihr unverteiltes Rechenbeispiel, nicht der Depotwert. Kurse, Stückzahlen und Erlöse bleiben unbekannt.",
    taxYears: "Kalenderjahre im Beispiel", noTaxPromise: "— keine zugesicherte Steuerersparnis.",
    cash: "Geld bereithalten", cashHelp: "Bald benötigtes Geld kann auf verzinstem Tagesgeld liegen. Prüfen Sie Zins, Einlagensicherung und Inflation; der übrige Teil muss nicht sofort verkauft werden.",
    tax: "Steuern in Deutschland", taxHelp: "Rechtsstand 2026: Der Sparer-Pauschbetrag von 1.000 € pro Person und Jahr gilt für Kapitalerträge, nicht den gesamten Verkaufserlös. Zwei Kalenderjahre garantieren keine doppelte Entlastung.",
    taxFunds: "Bei qualifizierenden Aktienfonds können 30 % der Erträge teilfreigestellt sein; bereits angesetzte Vorabpauschalen sind beim späteren Verkauf zu berücksichtigen.",
    taxCaution: "Keine Steuerberechnung. Regeln können sich ändern: Vor echten Verkäufen Brokerbelege und Steuerberater prüfen.",
    disclaimer: "Nur eine nutzergesteuerte Rechenskizze — keine Anlage- oder Steuerberatung, keine Renditegarantie, keine automatische Transaktion.",
    years: "Jahre", months: "Monate",
  },
  vi: {
    heading: "Kế hoạch sử dụng tiền", tag: "Chỉ mô phỏng",
    intro: "Minh họa tiền dùng sau này theo lựa chọn của bạn. App không giao dịch hay lưu kế hoạch bán.",
    goal: "Chọn mục tiêu", goalHelp: "Chọn Goal đang có. Chưa chọn thì kế hoạch để trống.",
    select: "Mục tiêu của tôi", none: "Chưa chọn mục tiêu", noGoals: "Hãy tạo Goal tương lai trong Goals. App không tự điền ngày ví dụ.",
    date: "Ngày sử dụng", target: "Số tiền Goal (không phải tiền bán)", protected: "Đã được bảo vệ",
    purchasing: "Sức mua năm gốc", notSale: "— không phải tiền bán tương lai.",
    risk: "Rà soát rủi ro", riskHelp: "Xem lại nguy cơ giảm giá trước ngày cần tiền. Đây không phải tỷ lệ phân bổ bắt buộc.",
    from: "Rà soát từ", until: "Mốc", future: "Tích lũy",
    sale: "Chia đợt minh họa", saleHelp: "Chia ngày giúp tránh phụ thuộc một thời điểm nhưng không bảo đảm giá tốt hơn. Các con số chỉ là minh họa.",
    budget: "Ngân sách mô phỏng do bạn tự nhập (€)", noBudget: "Chưa nhập số tiền",
    budgetHelp: "Không lấy tiền từ danh mục/Goal và không tự trừ protectedAmount.",
    invalid: "Nhập euro dương, tối đa hai chữ số thập phân.",
    past: "Lịch đã bắt đầu trong quá khứ. Hãy sửa thời gian hoặc Goal.",
    empty: "Chưa có đợt. Hãy chọn Goal và nhập ngân sách minh họa.",
    stage: "Đợt", amount: "Tiền mẫu", remaining: "Ngân sách còn",
    remainingHelp: "Đây là ngân sách mẫu chưa chia, không phải số dư danh mục. Giá bán và tiền thực thu chưa biết.",
    taxYears: "Các năm dương lịch", noTaxPromise: "— không bảo đảm tiết kiệm thuế.",
    cash: "Giữ tiền sau bán", cashHelp: "Tiền sớm cần dùng có thể để nơi ít biến động, có lãi như Tagesgeld. Cần kiểm tra lãi, bảo hiểm tiền gửi và lạm phát.",
    tax: "Lưu ý thuế Đức", taxHelp: "Luật 2026: Sparer-Pauschbetrag 1.000 €/người/năm áp dụng với thu nhập vốn, không phải toàn bộ tiền bán. Hai năm không bảo đảm hai hạn mức.",
    taxFunds: "Quỹ cổ phiếu đủ điều kiện có thể được Teilfreistellung 30%; Vorabpauschale đã tính cần được xem xét khi bán.",
    taxCaution: "Không tính thuế cá nhân. Luật có thể đổi: hãy kiểm tra chứng từ broker và hỏi Steuerberater.",
    disclaimer: "Chỉ là phép chia mẫu do bạn chọn, không tư vấn đầu tư hay thuế, không hứa lợi nhuận hoặc giao dịch tự động.",
    years: "năm", months: "tháng",
  },
};
const money = (cents: number, locale: DisplayLocale) => new Intl.NumberFormat(locale === "de" ? "de-DE" : "vi-VN", { style: "currency", currency: "EUR" }).format(cents / 100);
const dateLabel = (date: string, locale: DisplayLocale) => new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "vi-VN", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(date + "T12:00:00Z"));

export default function ExitPlanSection({ goals, locale }: Props) {
  const t = copy[locale];
  const [goalId, selectGoal] = useState("");
  const [years, setYears] = useState<ReviewHorizonYears>(5);
  const [months, setMonths] = useState<ExitWindowMonths>(18);
  const [budget, setBudget] = useState("");
  const now = new Date();
  const today = [now.getFullYear(), String(now.getMonth()+1).padStart(2,"0"), String(now.getDate()).padStart(2,"0")].join("-");
  const eligible = goals.filter(g => !g.deletedAt && validExitDate(g.dueDate) && g.dueDate >= today);
  const goal = eligible.find(g => g.id === goalId);
  const amount = goal ? parseIllustrationBudgetCents(budget) : null;
  const rows = goal && amount !== null ? buildExitInstallments(goal.dueDate, budget, months) : [];
  const past = rows.some(r => r.date < today);
  const yearsInRows = [...new Set((past ? [] : rows).map(r => r.date.slice(0,4)))];
  return (
    <section className="gl exit-plan" data-testid="simulation-exit-plan" aria-labelledby="exit-plan-heading">
      <header className="exit-plan-head"><div><small>{t.tag}</small><h2 id="exit-plan-heading">{t.heading}</h2><p>{t.intro}</p></div></header>
      <div className="exit-plan-step">
        <h3><b>01</b> {t.goal}</h3><p>{t.goalHelp}</p>
        <label htmlFor="exit-plan-goal">{t.select}</label>
        <select id="exit-plan-goal" value={goalId} onChange={e => {selectGoal(e.target.value);setBudget("");}}>
          <option value="">{t.none}</option>{eligible.map(g => <option key={g.id} value={g.id}>{g.name} · {dateLabel(g.dueDate, locale)}</option>)}
        </select>
        {!eligible.length && <p className="exit-plan-note">{t.noGoals}</p>}
        {goal && <div className="exit-plan-facts">
          <div><span>{t.date}</span><strong>{dateLabel(goal.dueDate, locale)}</strong></div>
          <div><span>{t.target}</span><strong>{money(Math.round(goal.amount*100), locale)}</strong></div>
          <div><span>{t.protected}</span><strong>{money(Math.round(goal.protectedAmount*100), locale)}</strong></div>
          {goal.mode === "purchasing_power" && <small>{t.purchasing} {goal.baseYear} {t.notSale}</small>}
        </div>}
      </div>
      <div className="exit-plan-step">
        <h3><b>02</b> {t.risk}</h3><p>{t.riskHelp}</p>
        <div className="exit-plan-choice" role="group" aria-label={t.risk}>
          {([3,5,7] as const).map(n => <button type="button" key={n} aria-pressed={years===n} onClick={()=>setYears(n)}>{n} {t.years}</button>)}
        </div>
        {goal && <div className="exit-plan-timeline"><span>{t.future}</span><span>{t.from} {dateLabel(monthsBefore(goal.dueDate,12*years)!,locale)}</span><span>{t.until} {dateLabel(goal.dueDate,locale)}</span></div>}
      </div>
      <div className="exit-plan-step">
        <h3><b>03</b> {t.sale}</h3><p>{t.saleHelp}</p>
        <div className="exit-plan-choice" role="group" aria-label={t.sale}>
          {([12,18,24] as const).map(n => <button type="button" key={n} aria-pressed={months===n} onClick={()=>setMonths(n)}>{n} {t.months}</button>)}
        </div>
        <label htmlFor="exit-plan-budget">{t.budget}</label>
        <input id="exit-plan-budget" type="text" inputMode="decimal" placeholder={t.noBudget}
          value={budget} disabled={!goal} onChange={e=>setBudget(e.target.value)} />
        <p className="exit-plan-note">{t.budgetHelp}</p>
        {goal && budget.trim() && amount===null && <p role="status" className="exit-plan-warning">{t.invalid}</p>}
        {past && <p role="status" className="exit-plan-warning">{t.past}</p>}
        {rows.length>0 && !past ? <>
          <div className="exit-plan-table-wrap"><table className="exit-plan-table">
            <thead><tr><th>{t.stage}</th><th>{t.date}</th><th>{t.amount}</th><th>{t.remaining}</th></tr></thead>
            <tbody>{rows.map(r=><tr key={r.date}><td>{r.ordinal}/{rows.length}</td><td>{dateLabel(r.date,locale)}</td><td>{money(r.plannedCents,locale)}</td><td>{money(r.remainingBudgetCents,locale)}</td></tr>)}</tbody>
          </table></div>
          <p className="exit-plan-note">{t.remainingHelp}</p>
          {yearsInRows.length>1 && <p className="exit-plan-note">{t.taxYears}: {yearsInRows.join(" / ")} {t.noTaxPromise}</p>}
        </> : <p className="exit-plan-empty">{t.empty}</p>}
      </div>
      <div className="exit-plan-step"><h3><b>04</b> {t.cash}</h3><p>{t.cashHelp}</p></div>
      <div className="exit-plan-step"><h3><b>05</b> {t.tax}</h3><p>{t.taxHelp}</p><p>{t.taxFunds}</p><p>{t.taxCaution}</p>
        <nav className="exit-plan-sources" aria-label={t.tax}>
          <a href="https://www.gesetze-im-internet.de/estg/__20.html" rel="noopener noreferrer" target="_blank">§ 20 EStG</a>
          <a href="https://www.gesetze-im-internet.de/invstg_2018/__20.html" rel="noopener noreferrer" target="_blank">§ 20 InvStG</a>
          <a href="https://www.gesetze-im-internet.de/invstg_2018/__19.html" rel="noopener noreferrer" target="_blank">§ 19 InvStG</a>
        </nav>
      </div>
      <p className="exit-plan-disclaimer">{t.disclaimer}</p>
    </section>
  );
}
