import { useState } from "react";
import type { Goal } from "../lib/types";
import type { DisplayLocale } from "../ui/localeFormatting";
import { findYearsForTarget } from "../lib/simulation/engine";
import { buildExitInstallments, monthsBefore, parseIllustrationBudgetCents, validExitDate, type ExitWindowMonths, type ReviewHorizonYears } from "../lib/simulation/exitPlan";
import "../styles/simulation-exit-plan.css";

type Props = {
  goals: readonly Goal[];
  locale: DisplayLocale;
  /** The same real priced value shown by Overview, not the editable Simulation starting amount. */
  actualBalance: number | null;
  /** Current saved Sparplan amount from AppSettings, not the editable Simulation scenario. */
  actualMonthly: number | null;
};

const copy = {
  de: {
    heading: "Wenn Sie später Geld brauchen",
    tag: "Ihr Plan, einfach erklärt",
    piggy: "Stellen Sie sich Ihr Depot wie ein Sparschwein vor:",
    balance: "Im Moment sind", inPiggy: "darin.",
    balanceUnknown: "Der aktuelle Wert ist noch nicht sicher bekannt.",
    pay: "Jeden Monat kommen", payEnd: "dazu.",
    payUnknown: "Die monatliche Sparrate ist noch nicht hinterlegt.",
    goalLine: "Ihr gesetztes Ziel:", goalMissing: "Wählen Sie unten erst ein Ziel und einen Termin.",
    reaches: "Nur mit dieser Sparrate wäre die genannte Summe rechnerisch ungefähr im Jahr",
    reachesEnd: "erreicht. Ihr Ziel ist ein Wegweiser, kein Zeitpunkt zum vollständigen Verkauf.",
    noEstimate: "Ein ungefähres Jahr ist mit den verfügbaren Angaben nicht sinnvoll berechenbar.",
    estimateNote: "Nur eine einfache Rechnung mit unveränderten Monatsbeiträgen und ohne künftige Kursgewinne, Verluste, Inflation oder Steuern.",
    choose: "Welches Ziel soll hier stehen?", noGoal: "Noch kein Ziel gewählt",
    noFutureGoal: "Noch kein zukünftiges Ziel vorhanden. Sie können es unter „Ziele“ selbst anlegen.",
    goalTitle: "Ihr selbst gesetztes Ziel", date: "Wann Sie das Geld brauchen", target: "Wie viel Sie sich vorgenommen haben",
    protected: "Wie viel bereits sicher zurückgelegt ist",
    goalNote: "Das ist Ihre eigene Markierung – kein Verkaufsauftrag.",
    story: "Später sind nur drei Dinge wichtig",
    reviewWhen: "Ab", reviewNoDate: "Wenn Ihr Ziel näher rückt",
    review: "Schauen Sie in Ruhe, ob ein Teil des Geldes nach und nach sicherer liegen sollte. So kann ein Kursrückgang kurz vor dem Ziel weniger schaden.",
    sellWhen: "Im Zeitraum vor dem Ziel:", sellNoDate: "Vor dem Tag, an dem Sie das Geld brauchen",
    sell: "Statt alles an einem Tag zu verkaufen, können Sie kleinere Schritte über mehrere Monate prüfen. Das kann helfen, einen einzelnen schlechten Verkaufstag zu vermeiden, garantiert aber keinen besseren Preis.",
    afterWhen: "Nach den Verkäufen",
    after: "Geld, das Sie bald brauchen, kann zum Beispiel auf einem verzinsten Tagesgeldkonto auf seinen Einsatz warten.",
    today: "Heute müssen Sie nichts verkaufen. Bleiben Sie bei Ihren derzeitigen",
    perMonth: "pro Monat, solange der Sparplan für Sie passt.",
    todayUnknown: "Heute müssen Sie nichts verkaufen. Prüfen Sie Ihren Sparplan wie bisher.",
    reviewLabel: "Früher nachdenken:", years: "Jahre", months: "Monate",
    saleLabel: "Zeitraum für mehrere Schritte:",
    sample: "Nur ein Zahlenbeispiel – nicht Ihr echtes Geld",
    input: "Welchen Beispielbetrag möchten Sie aufteilen?", placeholder: "Betrag selbst eingeben",
    empty: "Die Tabelle erscheint, sobald Sie selbst einen Beispielbetrag eingeben und ein Ziel wählen.",
    invalid: "Bitte einen positiven Eurobetrag mit höchstens zwei Nachkommastellen eingeben.",
    past: "Der gewählte Zeitraum beginnt schon in der Vergangenheit. Prüfen Sie Ziel und Zeitraum.",
    step: "Schritt", saleNow: "In diesem Schritt verkaufen", remaining: "Noch nicht verkauft",
    remainExplain: "„Noch nicht verkauft“ meint nur den Rest Ihres Beispielbetrags, nicht Ihr Depotguthaben. Die Kurse beim späteren Verkauf kennen wir nicht.",
    look: "Simulation ansehen",
    disclaimer: "Nur zur Orientierung. Keine automatische Order, keine persönliche Steuerrechnung und keine Garantie. Vor echten Entscheidungen die eigene Lage prüfen.",
  },
  vi: {
    heading: "Khi nào cần dùng tiền?",
    tag: "Kể đơn giản về kế hoạch của bạn",
    piggy: "Hãy tưởng tượng quỹ này như một ống heo:",
    balance: "Hiện có", inPiggy: "trong đó.",
    balanceUnknown: "Chưa có giá trị danh mục đủ tin cậy để hiển thị.",
    pay: "Mỗi tháng bạn bỏ thêm", payEnd: ".",
    payUnknown: "Chưa có mức góp hằng tháng đã lưu.",
    goalLine: "Mốc bạn đặt:", goalMissing: "Hãy chọn một Goal và ngày cần dùng bên dưới.",
    reaches: "Nếu chỉ góp đều như vậy, số tiền mốc có thể đạt khoảng năm",
    reachesEnd: ". Mốc này để đánh dấu đường đi, không phải ngày phải bán hết.",
    noEstimate: "Chưa đủ dữ liệu để tính năm dự kiến một cách có ý nghĩa.",
    estimateNote: "Tính đơn giản theo mức góp hiện tại, giả sử giá không đổi; chưa tính lãi/lỗ tương lai, lạm phát hay thuế.",
    choose: "Bạn muốn xem mốc nào?", noGoal: "Chưa chọn Goal",
    noFutureGoal: "Chưa có Goal tương lai. Bạn có thể đặt mốc riêng trong Goals.",
    goalTitle: "Mốc bạn tự đặt", date: "Ngày cần dùng tiền", target: "Số tiền bạn đặt mốc",
    protected: "Phần đã chuyển sang an toàn",
    goalNote: "Đây là mốc bạn đặt, không phải lệnh bán.",
    story: "Sau này chỉ cần nhớ ba việc",
    reviewWhen: "Bắt đầu từ", reviewNoDate: "Khi gần tới mốc cần tiền",
    review: "Bắt đầu cân nhắc chuyển dần phần sắp cần dùng từ chứng khoán sang chỗ an toàn hơn. Như vậy nếu thị trường giảm mạnh, khoản tiền sắp dùng sẽ ít bị ảnh hưởng hơn.",
    sellWhen: "Trong thời gian trước mốc:",
    sellNoDate: "Trước khi cần tiền",
    sell: "Thay vì bán hết trong một ngày, bạn có thể chia bán thành vài lần. Cách này tránh phụ thuộc đúng một ngày giá thấp, nhưng không bảo đảm bán được giá tốt hơn.",
    afterWhen: "Sau khi bán",
    after: "Tiền sắp dùng có thể để vào tài khoản Tagesgeld có lãi, chờ đến lúc cần.",
    today: "Hôm nay chưa cần làm gì cả — cứ góp",
    perMonth: "/tháng như hiện tại, nếu mức góp vẫn phù hợp.",
    todayUnknown: "Hôm nay chưa cần bán gì cả — hãy giữ kế hoạch góp phù hợp với bạn.",
    reviewLabel: "Xem lại từ trước mốc:", years: "năm", months: "tháng",
    saleLabel: "Thời gian chia bán:",
    sample: "Số mẫu — không phải tiền thật của bạn",
    input: "Bạn muốn thử chia bao nhiêu €?", placeholder: "Tự nhập số tiền mẫu",
    empty: "Chọn Goal rồi nhập số mẫu để xem bảng. Chưa nhập thì không có bảng.",
    invalid: "Hãy nhập số euro dương, tối đa hai số lẻ.",
    past: "Khoảng chia bán đã bắt đầu trong quá khứ. Hãy chọn mốc hoặc khoảng phù hợp.",
    step: "Đợt", saleNow: "Bán đợt này", remaining: "Còn lại chưa bán",
    remainExplain: "“Còn lại chưa bán” chỉ là phần tiền mẫu còn lại, không phải số dư danh mục. Giá bán thật sau này chưa biết.",
    look: "Xem mô phỏng",
    disclaimer: "Chỉ để hình dung. App không bán tự động, không tính thuế cá nhân hay hứa lợi nhuận. Hãy tự kiểm tra trước khi bán thật.",
  },
};

const euros = (amount: number, locale: DisplayLocale) =>
  new Intl.NumberFormat(locale === "de" ? "de-DE" : "vi-VN", { style: "currency", currency: "EUR" }).format(amount);
const dateLabel = (date: string, locale: DisplayLocale) =>
  new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "vi-VN", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(date + "T12:00:00Z"));
const yearOf = (date: string | null) => date?.slice(0, 4) ?? "—";

export default function ExitPlanSection({ goals, locale, actualBalance, actualMonthly }: Props) {
  const t = copy[locale];
  const [goalId, selectGoal] = useState("");
  const [reviewYears, setReviewYears] = useState<ReviewHorizonYears>(5);
  const [saleMonths, setSaleMonths] = useState<ExitWindowMonths>(18);
  const [exampleAmount, setExampleAmount] = useState("");

  const now = new Date();
  const today = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
  const eligible = goals.filter((g) => !g.deletedAt && validExitDate(g.dueDate) && g.dueDate >= today);
  const goal = eligible.find((g) => g.id === goalId);
  const balanceValid = actualBalance !== null && Number.isFinite(actualBalance) && actualBalance >= 0;
  const monthlyValid = actualMonthly !== null && Number.isFinite(actualMonthly) && actualMonthly >= 0;

  // Reuse the existing Simulation engine with zero returns/costs for a simple
  // saved-contributions-only reference year. Not the editable scenario settings.
  // A purchasing-power Goal cannot be compared directly to nominal EUR.
  const yearEstimate = goal && goal.mode === "nominal" && Number.isFinite(goal.amount)
    && goal.amount > 0 && balanceValid && monthlyValid
    ? findYearsForTarget(goal.amount, {
        initialBalance: actualBalance, monthlyContribution: actualMonthly,
        lumpSum: 0, annualReturn: 0, annualContributionGrowth: 0, ter: 0,
      })
    : null;
  const estimatedYear = yearEstimate?.reached ? now.getFullYear() + yearEstimate.years : null;
  const reviewDate = goal ? monthsBefore(goal.dueDate, reviewYears * 12) : null;
  const saleStart = goal ? monthsBefore(goal.dueDate, saleMonths) : null;
  const amount = goal ? parseIllustrationBudgetCents(exampleAmount) : null;
  const rows = goal && amount !== null ? buildExitInstallments(goal.dueDate, exampleAmount, saleMonths) : [];
  const past = rows.some((r) => r.date < today);
  const validRows = past ? [] : rows;
  const goalMoney = (n: number) => Number.isFinite(n) && n >= 0 ? euros(n, locale) : "—";

  return <section className="gl exit-plan" data-testid="simulation-exit-plan" aria-labelledby="exit-plan-heading">
    <header className="exit-plan-head">
      <small>{t.tag}</small>
      <h2 id="exit-plan-heading">{t.heading}</h2>
      <div className="exit-plan-story">
        <p>{t.piggy} {balanceValid
          ? <>{t.balance} <strong>{euros(actualBalance, locale)}</strong> {t.inPiggy}</>
          : t.balanceUnknown}</p>
        <p>{monthlyValid
          ? <>{t.pay} <strong>{euros(actualMonthly, locale)}</strong> {t.payEnd}</>
          : t.payUnknown}</p>
        <p>{goal ? <>{t.goalLine} <strong>{goalMoney(goal.amount)}</strong> · <strong>{dateLabel(goal.dueDate, locale)}</strong>.</> : t.goalMissing}</p>
        <p>{estimatedYear !== null ? <>{t.reaches} <strong>{estimatedYear}</strong>{t.reachesEnd}</> : t.noEstimate}</p>
        {estimatedYear !== null && <small>{t.estimateNote}</small>}
      </div>
    </header>

    <div className="exit-plan-goal">
      <label htmlFor="exit-plan-goal">{t.choose}</label>
      <select id="exit-plan-goal" value={goalId} onChange={(e) => { selectGoal(e.target.value); setExampleAmount(""); }}>
        <option value="">{t.noGoal}</option>
        {eligible.map((g) => <option value={g.id} key={g.id}>{g.name} · {dateLabel(g.dueDate, locale)}</option>)}
      </select>
      {!eligible.length && <p className="exit-plan-note">{t.noFutureGoal}</p>}
      {goal && <div className="exit-plan-facts">
        <h3>{t.goalTitle}</h3>
        <dl>
          <div><dt>{t.date}</dt><dd>{dateLabel(goal.dueDate, locale)}</dd></div>
          <div><dt>{t.target}</dt><dd>{goalMoney(goal.amount)}</dd></div>
          <div><dt>{t.protected}</dt><dd>{goalMoney(goal.protectedAmount)}</dd></div>
        </dl>
        <p>{t.goalNote}</p>
      </div>}
    </div>

    <div className="exit-plan-todo">
      <h3>{t.story}</h3>
      <ol className="exit-plan-steps">
        <li>
          <strong>{reviewDate ? t.reviewWhen + " " + dateLabel(reviewDate, locale) : t.reviewNoDate}</strong>
          <p>{t.review}</p>
        </li>
        <li>
          <strong>{saleStart && goal
            ? t.sellWhen + " " + dateLabel(saleStart, locale) + " – " + dateLabel(goal.dueDate, locale)
            : t.sellNoDate}</strong>
          <p>{t.sell}</p>
        </li>
        <li><strong>{t.afterWhen}</strong><p>{t.after}</p></li>
      </ol>
      <p className="exit-plan-today">{monthlyValid
        ? <>{t.today} <strong>{euros(actualMonthly, locale)}</strong>{t.perMonth}</>
        : t.todayUnknown}</p>
    </div>

    <div className="exit-plan-example">
      <h3>{t.sample}</h3>
      <div className="exit-plan-choices">
        <label htmlFor="exit-plan-years">{t.reviewLabel}</label>
        <select id="exit-plan-years" value={reviewYears} onChange={(e) => setReviewYears(Number(e.target.value) as ReviewHorizonYears)}>
          {([3, 5, 7] as const).map((y) => <option key={y} value={y}>{y} {t.years}</option>)}
        </select>
        <label htmlFor="exit-plan-months">{t.saleLabel}</label>
        <select id="exit-plan-months" value={saleMonths} onChange={(e) => setSaleMonths(Number(e.target.value) as ExitWindowMonths)}>
          {([12, 18, 24] as const).map((m) => <option key={m} value={m}>{m} {t.months}</option>)}
        </select>
      </div>
      <label htmlFor="exit-plan-budget">{t.input}</label>
      <input id="exit-plan-budget" type="text" inputMode="decimal" placeholder={t.placeholder}
        disabled={!goal} value={exampleAmount} onChange={(e) => setExampleAmount(e.target.value)} />
      {goal && exampleAmount.trim() && amount === null && <p className="exit-plan-warning" role="status">{t.invalid}</p>}
      {past && <p className="exit-plan-warning" role="status">{t.past}</p>}
      {validRows.length > 0 ? <div className="exit-plan-table-wrap">
        <table className="exit-plan-table"><thead><tr>
          <th scope="col">{t.step}</th><th scope="col">{t.date}</th>
          <th scope="col">{t.saleNow}</th><th scope="col">{t.remaining}</th>
        </tr></thead><tbody>{validRows.map((r) => <tr key={r.date}>
          <td>{r.ordinal}/{validRows.length}</td><td>{dateLabel(r.date, locale)}</td>
          <td>{euros(r.plannedCents / 100, locale)}</td><td>{euros(r.remainingBudgetCents / 100, locale)}</td>
        </tr>)}</tbody></table>
        <p className="exit-plan-note">{t.remainExplain}</p>
      </div> : <p className="exit-plan-note">{t.empty}</p>}
    </div>
    <a className="exit-plan-link" href="#/simulation" onClick={(event) => {
      const chart = document.getElementById("simulation-growth-chart");
      if (chart) { event.preventDefault(); chart.scrollIntoView({ behavior: "smooth" }); }
    }}>{t.look}</a>
    <p className="exit-plan-disclaimer">{t.disclaimer}</p>
  </section>;
}
