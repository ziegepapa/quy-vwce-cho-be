import { useEffect, useMemo, useState } from "react";
import { deleteGoal, listGoals, uid, upsertGoal } from "../lib/db";
import type { Goal, GoalMode, GoalUrgency } from "../lib/types";
import {
  goalProgressStatus,
  inflate,
  monthsBetween,
  parseDate,
  parseDecimal,
} from "../lib/calc";
import { nowIso } from "../lib/defaults";
import { useNavAction } from "../lib/navActions";
import { useRecoveryReadOnly } from "../lib/recoveryReadOnly";
import { useLocale } from "../lib/locale";
import { formatDisplayDate, formatDisplayMoney } from "../ui/localeFormatting";
import ActionMenu from "../components/ActionMenu";

function blankForm(locale: "vi" | "de") {
  return {
  name: locale === "de" ? "Ziel" : "Mục tiêu",
  dueDate: "2038-06-30",
  amount: "10000",
  mode: "purchasing_power" as GoalMode,
  baseYear: "2026",
  inflationRate: "0.02",
  bufferPct: "0.1",
  urgency: "hard" as GoalUrgency,
  protectedAmount: "0",
  notes: "",
  };
}

function goalCopy(locale: "vi" | "de") {
  return locale === "de" ? {
    loading: "Ziele werden geladen…", loadError: "Ziele konnten nicht geladen werden", safeData: "Ihre Gerätedaten bleiben unverändert. Bitte versuchen Sie es erneut.", retry: "Erneut versuchen", gap: "Noch zu schützen", needProtected: (need: string, protectedAmount: string) => `Zu schützen ${need} · Geschützt ${protectedAmount}`, monthlyNeed: (value: string, count: number) => `Bei der aktuellen Rate werden zusätzlich ${value}/Monat für alle ${count} Ziele benötigt.`, noGoals: "Noch keine Ziele.", addFirst: "Erstes Ziel hinzufügen", months: "Monate", hard: "Verbindlich", flexible: "Flexibel", edit: "Bearbeiten", delete: "Löschen", deleteConfirm: "Dieses Ziel löschen?", protectMore: "Zusätzlich schützen", perMonth: "/Monat", editGoal: "Ziel bearbeiten", addGoal: "Ziel hinzufügen", name: "Name", dueDate: "Verwendungsdatum", amount: "Betrag (Basisjahr)", mode: "Modus", nominal: "Nominal", purchasingPower: "Inflationsbereinigt", inflation: "Inflation", buffer: "Puffer", protected: "Geschützt", urgency: "Verbindlichkeit", preview: "Vorschau", save: "Speichern", cancel: "Abbrechen", status: { green: "Im Plan", yellow: "Aufmerksamkeit nötig", red: "Risiko einer Lücke" },
  } : {
    loading: "Đang tải mục tiêu…", loadError: "Không tải được Mục tiêu", safeData: "Dữ liệu trên thiết bị vẫn được giữ nguyên. Hãy thử tải lại.", retry: "Thử lại", gap: "Còn thiếu", needProtected: (need: string, protectedAmount: string) => `Cần bảo vệ ${need} · Đã bảo vệ ${protectedAmount}`, monthlyNeed: (value: string, count: number) => `Với nhịp hiện tại, cần thêm ${value}/tháng để đạt cả ${count} mục tiêu.`, noGoals: "Chưa có mục tiêu.", addFirst: "Thêm mục tiêu đầu tiên", months: "tháng", hard: "Bắt buộc", flexible: "Linh hoạt", edit: "Sửa", delete: "Xóa", deleteConfirm: "Xóa mục tiêu này?", protectMore: "Cần bảo vệ thêm", perMonth: "/tháng", editGoal: "Sửa mục tiêu", addGoal: "Thêm mục tiêu", name: "Tên", dueDate: "Ngày cần tiền", amount: "Số tiền (năm cơ sở)", mode: "Chế độ", nominal: "Danh nghĩa", purchasingPower: "Điều chỉnh lạm phát", inflation: "Lạm phát", buffer: "Buffer", protected: "Đã bảo vệ", urgency: "Mức độ", preview: "Preview", save: "Lưu", cancel: "Hủy", status: { green: "Đúng tiến độ", yellow: "Cần chú ý", red: "Nguy cơ thiếu" },
  };
}

function Ring({ pct, status }: { pct: number; status: string }) {
  const shown = pct <= 0 ? 2 : Math.min(100, pct);
  return (
    <div className="progress-ring" aria-label={`${Math.round(pct)}%`}>
      <svg viewBox="0 0 36 36">
        <path
          className="ring-bg"
          d="M18 2.5a15.5 15.5 0 1 1 0 31 15.5 15.5 0 1 1 0-31"
        />
        <path
          className={`ring-fg ${status}`}
          strokeDasharray={`${shown}, 100`}
          d="M18 2.5a15.5 15.5 0 1 1 0 31 15.5 15.5 0 1 1 0-31"
        />
        <text x="18" y="20.5" textAnchor="middle" className="ring-text">
          {Math.round(pct)}%
        </text>
      </svg>
    </div>
  );
}

export default function Goals() {
  const { locale } = useLocale();
  const text = useMemo(() => goalCopy(locale), [locale]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [show, setShow] = useState(false);
  const [edit, setEdit] = useState<Goal | null>(null);
  const [form, setForm] = useState(() => blankForm(locale));
  const { readOnly, showBlocked } = useRecoveryReadOnly();

  async function reload() {
    try {
      setGoals(await listGoals());
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    setLoading(true);
    setLoadError(false);
    void reload();
  }, [loadAttempt]);

  // V9 B2: một đường vào duy nhất cho "thêm mới".
  // Trước đây nút empty-state quên reset `edit` → lưu đè lên mục tiêu cũ.
  function openCreate() {
    if (readOnly) { showBlocked(); return; }
    setEdit(null);
    setForm(blankForm(locale));
    setShow(true);
  }

  // V9 B2: icon "+" trên top bar chỉ hiện khi dòng này chạy.
  useNavAction("addGoal", openCreate);

  // V9 B2: new Date() mọi render làm useMemo bên dưới mất tác dụng.
  const today = useMemo(() => new Date(), []);

  const summary = useMemo(() => {
    let need = 0;
    let protectedSum = 0;
    let nearest: Goal | null = null;
    let nearestMonths = Infinity;
    for (const g of goals) {
      const due = parseDate(g.dueDate);
      const years = Math.max(0, due.getFullYear() - g.baseYear);
      const adj =
        g.mode === "purchasing_power" ? inflate(g.amount, g.inflationRate, years) : g.amount;
      need += adj;
      protectedSum += g.protectedAmount;
      const m = monthsBetween(today, due);
      if (m >= 0 && m < nearestMonths) {
        nearestMonths = m;
        nearest = g;
      }
    }
    const gap = Math.max(0, need - protectedSum);
    const monthsLeft = nearestMonths === Infinity ? 0 : nearestMonths;
    const perMonth = monthsLeft > 0 ? gap / monthsLeft : gap;
    const pct = need > 0 ? Math.min(100, (protectedSum / need) * 100) : 0;
    return { need, protectedSum, gap, nearest, nearestMonths, count: goals.length, perMonth, pct };
  }, [goals, today]);

  async function save() {
    if (readOnly) { showBlocked(); return; }
    await upsertGoal({
      id: edit?.id ?? uid("goal"),
      name: form.name,
      dueDate: form.dueDate,
      amount: parseDecimal(form.amount),
      mode: form.mode,
      baseYear: Number(form.baseYear) || 2026,
      inflationRate: parseDecimal(form.inflationRate),
      bufferPct: parseDecimal(form.bufferPct),
      urgency: form.urgency,
      protectedAmount: parseDecimal(form.protectedAmount),
      notes: form.notes,
      createdAt: edit?.createdAt ?? nowIso(),
      updatedAt: nowIso(),
    });
    setShow(false);
    await reload();
  }

  function openEdit(g: Goal) {
    if (readOnly) { showBlocked(); return; }
    setEdit(g);
    setForm({
      name: g.name,
      dueDate: g.dueDate,
      amount: String(g.amount),
      mode: g.mode,
      baseYear: String(g.baseYear),
      inflationRate: String(g.inflationRate),
      bufferPct: String(g.bufferPct),
      urgency: g.urgency,
      protectedAmount: String(g.protectedAmount),
      notes: g.notes,
    });
    setShow(true);
  }

  const previewYears = Math.max(
    0,
    parseDate(form.dueDate).getFullYear() - (Number(form.baseYear) || 2026),
  );
  const previewAmount = parseDecimal(form.amount);
  const previewAdj =
    form.mode === "purchasing_power"
      ? inflate(previewAmount, parseDecimal(form.inflationRate), previewYears)
      : previewAmount;

  if (loading) {
    return (
      <div className="empty card" role="status" aria-live="polite" aria-busy="true">
        <p>{text.loading}</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <section className="empty card" role="alert">
        <h1 className="page-title">{text.loadError}</h1>
        <p>{text.safeData}</p>
        <button type="button" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>
          {text.retry}
        </button>
      </section>
    );
  }

  return (
    <div>
      {/* V9 B2: hàng FAB cũ đã xoá. Nút "+" giờ nằm trên top bar
          qua useNavAction("addGoal") — tiết được ~56px ở đầu màn. */}

      <div className="goals-hero surface-raised">
        <Ring pct={summary.pct} status={summary.pct >= 80 ? "green" : summary.pct >= 40 ? "yellow" : "red"} />
        <div className="goals-hero-body">
          <div className="metric-label">{text.gap}</div>
          <div className="hero-money" style={{ color: "var(--text-primary)", fontSize: 28 }}>
            {formatDisplayMoney(summary.gap, locale)}
          </div>
          <p className="story-caption">
            {text.needProtected(formatDisplayMoney(summary.need, locale), formatDisplayMoney(summary.protectedSum, locale))}
          </p>
        </div>
      </div>

      {summary.count > 0 && summary.gap > 0 && summary.nearestMonths > 0 && (
        <div className="story-banner">
          {text.monthlyNeed(formatDisplayMoney(summary.perMonth, locale), summary.count)}
        </div>
      )}

      {!goals.length && (
        <div className="empty card surface-raised">
          <p>{text.noGoals}</p>
          <button type="button" onClick={openCreate}>
            {text.addFirst}
          </button>
        </div>
      )}

      <div className="timeline">
        {goals.map((g) => {
          const due = parseDate(g.dueDate);
          const years = Math.max(0, due.getFullYear() - g.baseYear);
          const adj =
            g.mode === "purchasing_power" ? inflate(g.amount, g.inflationRate, years) : g.amount;
          const months = monthsBetween(today, due);
          const status = goalProgressStatus({
            targetAdjusted: adj || 1,
            protectedAmount: g.protectedAmount,
            monthsRemaining: months,
          });
          const pct = adj > 0 ? Math.min(100, (g.protectedAmount / adj) * 100) : 0;
          const gap = Math.max(0, adj - g.protectedAmount);
          const perMonth = months > 0 ? gap / months : gap;

          return (
            <div className="timeline-item" key={g.id}>
              <div className={`timeline-dot ${status}`} aria-hidden />
              <div className="card surface-raised goal-card">
                <div className="row-between" style={{ alignItems: "flex-start" }}>
                  <div style={{ display: "flex", gap: 12, flex: 1, minWidth: 0 }}>
                    <Ring pct={pct} status={status} />
                    <div style={{ minWidth: 0 }}>
                      <strong style={{ fontSize: 16, fontWeight: 650 }}>{g.name}</strong>
                      <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                        {formatDisplayDate(g.dueDate, locale)} · {months} {text.months}
                      </div>
                      <span className="urgency-chip" style={{ marginTop: 6 }}>
                        {g.urgency === "hard" ? text.hard : text.flexible}
                      </span>
                    </div>
                  </div>
                  <ActionMenu
                    actions={[
                      { label: text.edit, onClick: () => openEdit(g) },
                      {
                        label: text.delete,
                        danger: true,
                        onClick: async () => {
                          if (readOnly) { showBlocked(); return; }
                          if (confirm(text.deleteConfirm)) {
                            await deleteGoal(g.id);
                            await reload();
                          }
                        },
                      },
                    ]}
                  />
                </div>

                <div style={{ marginTop: 12 }}>
                  <span className="muted" style={{ fontSize: 15 }}>
                    {formatDisplayMoney(g.amount, locale)}
                  </span>
                  {g.mode === "purchasing_power" && g.amount > 0 && (
                    <>
                      <span className="muted"> → </span>
                      <span className="metric-value money-md">{formatDisplayMoney(adj, locale)}</span>
                    </>
                  )}
                </div>

                <div className="progress-track">
                  <span style={{ width: `${pct}%` }} />
                </div>

                <div className="row-between" style={{ marginTop: 4 }}>
                  <span className={`status-chip ${status}`}>{text.status[status]}</span>
                </div>

                {gap > 0 && months > 0 && (
                  <p className="story-caption" style={{ marginTop: 8 }}>
                    {text.protectMore} <strong style={{ fontWeight: 650 }}>{formatDisplayMoney(perMonth, locale)}</strong>
                    {text.perMonth}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {show && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="sheet-handle" aria-hidden />
            <h2>{edit ? text.editGoal : text.addGoal}</h2>
            <div className="field">
              <label htmlFor="g-name">{text.name}</label>
              <input
                id="g-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="g-due">{text.dueDate}</label>
              <input
                id="g-due"
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="g-amt">{text.amount}</label>
              <input
                id="g-amt"
                inputMode="decimal"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="g-mode">{text.mode}</label>
              <select
                id="g-mode"
                value={form.mode}
                onChange={(e) => setForm({ ...form, mode: e.target.value as GoalMode })}
              >
                <option value="nominal">{text.nominal}</option>
                <option value="purchasing_power">{text.purchasingPower}</option>
              </select>
            </div>
            <div className="grid2">
              <div className="field">
                <label htmlFor="g-inf">{text.inflation}</label>
                <input
                  id="g-inf"
                  inputMode="decimal"
                  value={form.inflationRate}
                  onChange={(e) => setForm({ ...form, inflationRate: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="g-buf">{text.buffer}</label>
                <input
                  id="g-buf"
                  inputMode="decimal"
                  value={form.bufferPct}
                  onChange={(e) => setForm({ ...form, bufferPct: e.target.value })}
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="g-prot">{text.protected}</label>
              <input
                id="g-prot"
                inputMode="decimal"
                value={form.protectedAmount}
                onChange={(e) => setForm({ ...form, protectedAmount: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="g-urg">{text.urgency}</label>
              <select
                id="g-urg"
                value={form.urgency}
                onChange={(e) => setForm({ ...form, urgency: e.target.value as GoalUrgency })}
              >
                <option value="hard">{text.hard}</option>
                <option value="flexible">{text.flexible}</option>
              </select>
            </div>
            <div className="banner info" style={{ marginBottom: 12 }}>
              {text.preview}: {formatDisplayMoney(previewAmount, locale)}
              {form.mode === "purchasing_power" && <> → {formatDisplayMoney(previewAdj, locale)}</>}
            </div>
            <div className="stack">
              <button type="button" onClick={save}>
                {text.save}
              </button>
              <button type="button" className="secondary" onClick={() => setShow(false)}>
                {text.cancel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
