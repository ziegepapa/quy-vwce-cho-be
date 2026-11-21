import { useMemo, useState } from "react";
import type { Goal } from "../lib/types";
import type { DisplayLocale } from "../ui/localeFormatting";
import {
  buildExitInstallments,
  monthsBefore,
  parseIllustrationBudgetCents,
  validExitDate,
  type ExitWindowMonths,
  type ReviewHorizonYears,
} from "../lib/simulation/exitPlan";
import "../styles/simulation-exit-plan.css";

type Props = { goals: readonly Goal[]; locale: DisplayLocale };

function euroCents(cents: number, locale: DisplayLocale): string {
  return new Intl.NumberFormat(locale === "de" ? "de-DE" : "vi-VN", {
    style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(cents / 100);
}
function isoLabel(iso: string, locale: DisplayLocale): string {
  return new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "vi-VN", {
    day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC",
  }).format(new Date(iso + "T12:00:00Z"));
}
function todayIso(): string {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
}

export default function ExitPlanSection({ goals, locale }: Props) {
  // Deliberately empty: never infer an Exit date from settings, age or sample years.
  const [goalId, setGoalId] = useState("");
  const [horizon, setHorizon] = useState<ReviewHorizonYears>(5);
  const [months, setMonths] = useState<ExitWindowMonths>(18);
  const [budgetText, setBudgetText] = useState("");
  const isDe = locale === "de";
  const today = todayIso();
  const eligible = useMemo(
    () => goals.filter((g) => !g.deletedAt && validExitDate(g.dueDate) && g.dueDate >= today),
    [goals, today],
  );
  const goal = eligible.find((g) => g.id === goalId) ?? null;
  const reviewDate = goal ? monthsBefore(goal.dueDate, horizon * 12) : null;
  const budgetCents = goal ? parseIllustrationBudgetCents(budgetText) : null;
  const schedule = goal && budgetCents !== null
    ? buildExitInstallments(goal.dueDate, budgetText, months)
    : [];
  const inPast = schedule.some((row) => row.date < today);
  const visibleSchedule = inPast ? [] : schedule;
  const years = [...new Set(visibleSchedule.map((row) => row.date.slice(0, 4)))];
  const goalAmount = Number.isFinite(goal?.amount) && (goal?.amount ?? 0) >= 0
    ? euroCents(Math.round((goal?.amount ?? 0) * 100), locale) : "—";
  const protectedAmount = Number.isFinite(goal?.protectedAmount) && (goal?.protectedAmount ?? 0) >= 0
    ? euroCents(Math.round((goal?.protectedAmount ?? 0) * 100), locale) : "—";

  return (
    <section className="gl exit-plan" aria-labelledby="exit-plan-heading" data-testid="simulation-exit-plan">
      <header className="exit-plan-head">
        <div>
          <span className="exit-plan-kicker">{isDe ? "FÜR SPÄTER" : "DÀNH CHO SAU NÀY"}</span>
          <h2 id="exit-plan-heading">{isDe ? "Auszahlungsplan" : "Kế hoạch sử dụng tiền"}</h2>
          <p>{isDe
            ? "Ein unverbindliches Rechenbeispiel für einen selbst gewählten Zieltermin. Kein Verkauf wird ausgelöst."
            : "Minh họa theo mốc do bạn chọn. Ứng dụng không tạo lệnh bán."}</p>
        </div>
        <span className="exit-plan-pill">{isDe ? "Nur Simulation" : "Chỉ mô phỏng"}</span>
      </header>

      <div className="exit-plan-step">
        <div className="exit-plan-step-title"><span>01</span><h3>{isDe ? "Ziel auswählen" : "Chọn mục tiêu"}</h3></div>
        <p>{isDe
          ? "Wählen Sie ein vorhandenes Ziel aus „Ziele“. Solange Sie keines auswählen, bleiben Verkaufstermine und Beträge leer."
          : "Chọn một mục tiêu đã có trong Goals. Khi chưa chọn, lịch bán và số tiền sẽ để trống."}</p>
        <label className="exit-plan-label" htmlFor="exit-plan-goal">{isDe ? "Mein Ziel" : "Mục tiêu của tôi"}</label>
        <select id="exit-plan-goal" value={goalId} onChange={(e) => { setGoalId(e.target.value); setBudgetText(""); }}>
          <option value="">{isDe ? "Noch kein Ziel ausgewählt" : "Chưa chọn mục tiêu"}</option>
          {eligible.map((g) => <option key={g.id} value={g.id}>{g.name} · {isoLabel(g.dueDate, locale)}</option>)}
        </select>
        {eligible.length === 0 ? (
          <p className="exit-plan-note">{isDe
            ? "Kein geeignetes zukünftiges Ziel gefunden. Legen Sie unter „Ziele“ selbst einen Termin fest; die App übernimmt kein Beispieldatum."
            : "Chưa tìm thấy Goal tương lai hợp lệ. Bạn tự đặt ngày trong Goals; app không điền ngày mẫu."}</p>
        ) : null}
        {goal ? (
          <div className="exit-plan-facts">
            <div><span>{isDe ? "Verwendungsdatum" : "Ngày sử dụng"}</span><strong>{isoLabel(goal.dueDate, locale)}</strong></div>
            <div><span>{isDe ? "Zielbetrag (nicht automatisch Verkaufsbetrag)" : "Số tiền Goal (không tự dùng làm tiền bán)"}</span><strong>{goalAmount}</strong></div>
            <div><span>{isDe ? "Bereits als geschützt erfasst" : "Đã ghi nhận được bảo vệ"}</span><strong>{protectedAmount}</strong></div>
            {goal.mode === "purchasing_power" ? <small>{isDe
              ? `Der Zielbetrag bezieht sich auf die Kaufkraft im Basisjahr ${goal.baseYear}. Er wird nicht als zukünftiger Verkaufserlös verwendet.`
              : `Số tiền Goal tính theo sức mua năm ${goal.baseYear}, không tự chuyển thành tiền bán tương lai.`}</small> : null}
          </div>
        ) : null}
      </div>

      <div className="exit-plan-step">
        <div className="exit-plan-step-title"><span>02</span><h3>{isDe ? "Risiko rechtzeitig prüfen" : "Xem lại rủi ro trước mốc"}</h3></div>
        <p>{isDe
          ? "Je näher das Ziel, desto wichtiger ist eine Überprüfung der möglichen Verluste. Das ist eine Erinnerung, keine Vorgabe für Aktienquoten oder Umschichtungen."
          : "Càng gần ngày dùng tiền càng nên rà soát rủi ro giảm giá. Đây là lời nhắc, không phải tỷ lệ phân bổ hay lệnh chuyển tài sản."}</p>
        <div className="exit-plan-choice" role="group" aria-label={isDe ? "Prüffenster" : "Cửa sổ rà soát"}>
          {([3, 5, 7] as const).map((y) => (
            <button key={y} type="button" aria-pressed={horizon === y} onClick={() => setHorizon(y)}>
              {y} {isDe ? "Jahre" : "năm"}
            </button>
          ))}
        </div>
        {goal && reviewDate ? (
          <div className="exit-plan-timeline">
            <span>{isDe ? "Langfristig aufbauen" : "Tích lũy dài hạn"}</span>
            <span>{isDe ? `Risiko prüfen ab ${isoLabel(reviewDate, locale)}` : `Rà soát từ ${isoLabel(reviewDate, locale)}`}</span>
            <span>{isDe ? `Ziel ${isoLabel(goal.dueDate, locale)}` : `Mục tiêu ${isoLabel(goal.dueDate, locale)}`}</span>
          </div>
        ) : <p className="exit-plan-note">{isDe ? "Der Zeitstrahl erscheint erst nach Ihrer Zielwahl." : "Dòng thời gian chỉ hiện khi bạn chọn Goal."}</p>}
      </div>

      <div className="exit-plan-step">
        <div className="exit-plan-step-title"><span>03</span><h3>{isDe ? "Etappen rechnerisch aufteilen" : "Chia đợt để minh họa"}</h3></div>
        <p>{isDe
          ? "Mehrere Termine verteilen das Risiko eines einzigen Verkaufstages, garantieren aber keinen besseren Preis. Sie selbst geben den Modellbetrag ein; es sind keine Marktprognosen."
          : "Nhiều mốc giúp tránh phụ thuộc một ngày bán nhưng không bảo đảm giá tốt hơn. Bạn tự nhập ngân sách minh họa, không phải dự báo thị trường."}</p>
        <div className="exit-plan-choice" role="group" aria-label={isDe ? "Modellzeitraum" : "Thời gian chia đợt"}>
          {([12, 18, 24] as const).map((m) => (
            <button key={m} type="button" aria-pressed={months === m} onClick={() => setMonths(m)}>
              {m} {isDe ? "Monate" : "tháng"}
            </button>
          ))}
        </div>
        <label className="exit-plan-label" htmlFor="exit-plan-budget">
          {isDe ? "Selbst gewählter Modellbetrag in EUR" : "Ngân sách mô phỏng do bạn tự nhập (€)"}
        </label>
        <input
          id="exit-plan-budget"
          inputMode="decimal"
          type="text"
          placeholder={isDe ? "Kein Betrag eingetragen" : "Chưa nhập số tiền"}
          value={budgetText}
          disabled={!goal}
          onChange={(e) => setBudgetText(e.target.value)}
          aria-describedby="exit-plan-budget-note"
        />
        <p id="exit-plan-budget-note" className="exit-plan-note">{isDe
          ? "Dieser Betrag wird nicht aus dem Depotwert oder dem Zielbetrag geschätzt. Bereits geschütztes Geld wird nicht automatisch abgezogen."
          : "Không tự tính số này từ danh mục hay Goal; không tự trừ phần protectedAmount."}</p>
        {goal && budgetText.trim() && budgetCents === null ? (
          <p role="status" className="exit-plan-warning">{isDe
            ? "Bitte einen positiven Eurobetrag mit höchstens zwei Nachkommastellen eingeben."
            : "Vui lòng nhập số euro dương, tối đa hai chữ số thập phân."}</p>
        ) : null}
        {inPast ? <p role="status" className="exit-plan-warning">{isDe
          ? "Das gewählte Fenster beginnt bereits in der Vergangenheit. Wählen Sie ein kürzeres Fenster oder überprüfen Sie Ihr Ziel."
          : "Cửa sổ đã bắt đầu trong quá khứ. Hãy chọn khoảng ngắn hơn hoặc rà soát ngày Goal."}</p> : null}
        {visibleSchedule.length ? (
          <div className="exit-plan-table-wrap">
            <table className="exit-plan-table" aria-label={isDe ? "Rechnerische Verkaufsetappen" : "Bảng chia đợt giả định"}>
              <thead><tr>
                <th scope="col">{isDe ? "Etappe" : "Đợt"}</th>
                <th scope="col">{isDe ? "Datum" : "Ngày"}</th>
                <th scope="col">{isDe ? "Modellbetrag" : "Số tiền mẫu"}</th>
                <th scope="col">{isDe ? "Restbudget" : "Ngân sách còn"}</th>
              </tr></thead>
              <tbody>{visibleSchedule.map((row) => (
                <tr key={row.date}>
                  <td>{row.ordinal}/{visibleSchedule.length}</td>
                  <td>{isoLabel(row.date, locale)}</td>
                  <td>{euroCents(row.plannedCents, locale)}</td>
                  <td>{euroCents(row.remainingBudgetCents, locale)}</td>
                </tr>
              ))}</tbody>
            </table>
            <p className="exit-plan-note">{isDe
              ? "Restbudget bedeutet nur den noch nicht verteilten Modellbetrag — nicht den verbleibenden Depotwert. Reale Kurse, Stückzahlen, Gebühren und Erlöse sind unbekannt."
              : "Phần còn là ngân sách minh họa chưa chia, KHÔNG phải số dư danh mục. Chưa biết giá bán, chứng chỉ, phí và tiền thực thu."}</p>
            {years.length > 1 ? <p className="exit-plan-note">{isDe
              ? `Die Beispieldaten liegen in den Kalenderjahren ${years.join(" und ")}; daraus folgt keine zugesicherte Steuerersparnis.`
              : `Lịch mẫu trải qua các năm ${years.join(" và ")}; không bảo đảm tiết kiệm thuế.`}</p> : null}
          </div>
        ) : <p className="exit-plan-empty">{isDe
          ? "Noch keine Verkaufsetappen. Wählen Sie ein Ziel und geben Sie selbst einen Modellbetrag ein."
          : "Chưa có đợt minh họa. Hãy chọn Goal và tự nhập ngân sách."}</p>}
      </div>

      <div className="exit-plan-step">
        <div className="exit-plan-step-title"><span>04</span><h3>{isDe ? "Geld nach dem Verkauf" : "Tiền bán xong để đâu"}</h3></div>
        <p>{isDe
          ? "Kurzfristig benötigtes Geld kann auf einem verfügbaren, verzinsten Konto wie Tagesgeld liegen. Prüfen Sie Zinsen, Einlagensicherung und Inflation; nicht benötigtes Vermögen muss nicht am selben Tag verkauft werden."
          : "Tiền sớm cần dùng có thể cân nhắc nơi gửi ít biến động, có lãi như Tagesgeld. Kiểm tra lãi, bảo hiểm tiền gửi và lạm phát; phần chưa cần không phải bán cùng lúc."}</p>
      </div>

      <div className="exit-plan-step exit-plan-tax">
        <div className="exit-plan-step-title"><span>05</span><h3>{isDe ? "Steuerliche Hinweise (Deutschland)" : "Lưu ý thuế Đức"}</h3></div>
        <p>{isDe
          ? "Nach dem Rechtsstand 2026 gilt ein Sparer-Pauschbetrag von 1.000 € pro Person und Kalenderjahr für Kapitalerträge — nicht für den gesamten Verkaufserlös. Eine Verteilung über zwei Kalenderjahre garantiert keine doppelte Entlastung."
          : "Theo luật 2026, Sparer-Pauschbetrag 1.000 €/người/năm áp dụng cho thu nhập vốn, không phải toàn bộ tiền bán. Chia qua hai năm không bảo đảm dùng đủ hai hạn mức."}</p>
        <p>{isDe
          ? "Für qualifizierende Aktienfonds können 30 % der Erträge teilfreigestellt sein. Bereits angesetzte Vorabpauschalen müssen bei einem späteren Verkauf berücksichtigt werden."
          : "Với quỹ cổ phiếu đủ điều kiện, 30% thu nhập có thể được miễn theo Teilfreistellung. Vorabpauschale đã tính cần được xem xét khi bán sau này."}</p>
        <p><strong>{isDe ? "Keine Steuerberechnung." : "Không tính thuế cá nhân."}</strong> {isDe
          ? "Vorschriften können sich bis zum Verkauf ändern. Bitte Brokerbelege und Steuerberater vor einem tatsächlichen Verkauf prüfen."
          : "Luật có thể thay đổi trước khi bán. Hãy kiểm tra chứng từ broker và hỏi Steuerberater trước khi quyết định."}</p>
        <div className="exit-plan-sources">
          <a href="https://www.gesetze-im-internet.de/estg/__20.html" target="_blank" rel="noopener noreferrer">§ 20 EStG</a>
          <a href="https://www.gesetze-im-internet.de/invstg_2018/__20.html" target="_blank" rel="noopener noreferrer">§ 20 InvStG</a>
          <a href="https://www.gesetze-im-internet.de/invstg_2018/__19.html" target="_blank" rel="noopener noreferrer">§ 19 InvStG</a>
        </div>
      </div>
      <p className="exit-plan-disclaimer">{isDe
        ? "Nur eine nutzergesteuerte Rechenskizze. Keine Anlage- oder Steuerberatung, keine Renditegarantie, keine automatische Transaktion."
        : "Chỉ là phép chia tiền giả định do bạn chọn. Không tư vấn đầu tư/thuế, không hứa lợi nhuận, không giao dịch tự động."}</p>
    </section>
  );
}
