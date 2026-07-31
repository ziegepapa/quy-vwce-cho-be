import { useEffect, useMemo, useState } from "react";
import { deleteGoal, listGoals, uid, upsertGoal } from "../lib/db";
import type { Goal, GoalMode, GoalUrgency } from "../lib/types";
import {
  formatDateVN,
  formatMoney,
  goalProgressStatus,
  inflate,
  monthsBetween,
  parseDate,
  parseDecimal,
  statusLabel,
} from "../lib/calc";
import { nowIso } from "../lib/defaults";
import { useNavAction } from "../lib/navActions";
import ActionMenu from "../components/ActionMenu";

const BLANK_FORM = {
  name: "Mục tiêu",
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
  const [goals, setGoals] = useState<Goal[]>([]);
  const [show, setShow] = useState(false);
  const [edit, setEdit] = useState<Goal | null>(null);
  const [form, setForm] = useState(BLANK_FORM);

  async function reload() {
    setGoals(await listGoals());
  }
  useEffect(() => {
    reload();
  }, []);

  // V9 B2: một đường vào duy nhất cho "thêm mới".
  // Trước đây nút empty-state quên reset `edit` → lưu đè lên mục tiêu cũ.
  function openCreate() {
    setEdit(null);
    setForm(BLANK_FORM);
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

  return (
    <div>
      {/* V9 B2: hàng FAB cũ đã xoá. Nút "+" giờ nằm trên top bar
          qua useNavAction("addGoal") — tiết được ~56px ở đầu màn. */}

      <div className="goals-hero surface-raised">
        <Ring pct={summary.pct} status={summary.pct >= 80 ? "green" : summary.pct >= 40 ? "yellow" : "red"} />
        <div className="goals-hero-body">
          <div className="metric-label">Còn thiếu</div>
          <div className="hero-money" style={{ color: "var(--text-primary)", fontSize: 28 }}>
            {formatMoney(summary.gap)}
          </div>
          <p className="story-caption">
            Cần bảo vệ {formatMoney(summary.need)} · Đã bảo vệ {formatMoney(summary.protectedSum)}
          </p>
        </div>
      </div>

      {summary.count > 0 && summary.gap > 0 && summary.nearestMonths > 0 && (
        <div className="story-banner">
          Với nhịp hiện tại, cần thêm{" "}
          <strong>{formatMoney(summary.perMonth)}/tháng</strong> để đạt cả {summary.count} mục tiêu.
        </div>
      )}

      {!goals.length && (
        <div className="empty card surface-raised">
          <p>Chưa có mục tiêu.</p>
          <button type="button" onClick={openCreate}>
            Thêm mục tiêu đầu tiên
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
                        {formatDateVN(g.dueDate)} · {months} tháng
                      </div>
                      <span className="urgency-chip" style={{ marginTop: 6 }}>
                        {g.urgency === "hard" ? "Bắt buộc" : "Linh hoạt"}
                      </span>
                    </div>
                  </div>
                  <ActionMenu
                    actions={[
                      { label: "Sửa", onClick: () => openEdit(g) },
                      {
                        label: "Xóa",
                        danger: true,
                        onClick: async () => {
                          if (confirm("Xóa mục tiêu này?")) {
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
                    {formatMoney(g.amount)}
                  </span>
                  {g.mode === "purchasing_power" && g.amount > 0 && (
                    <>
                      <span className="muted"> → </span>
                      <span className="metric-value money-md">{formatMoney(adj)}</span>
                    </>
                  )}
                </div>

                <div className="progress-track">
                  <span style={{ width: `${pct}%` }} />
                </div>

                <div className="row-between" style={{ marginTop: 4 }}>
                  <span className={`status-chip ${status}`}>{statusLabel(status)}</span>
                </div>

                {gap > 0 && months > 0 && (
                  <p className="story-caption" style={{ marginTop: 8 }}>
                    Cần bảo vệ thêm <strong style={{ fontWeight: 650 }}>{formatMoney(perMonth)}</strong>
                    /tháng
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
            <h2>{edit ? "Sửa mục tiêu" : "Thêm mục tiêu"}</h2>
            <div className="field">
              <label htmlFor="g-name">Tên</label>
              <input
                id="g-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="g-due">Ngày cần tiền</label>
              <input
                id="g-due"
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="g-amt">Số tiền (năm cơ sở)</label>
              <input
                id="g-amt"
                inputMode="decimal"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="g-mode">Chế độ</label>
              <select
                id="g-mode"
                value={form.mode}
                onChange={(e) => setForm({ ...form, mode: e.target.value as GoalMode })}
              >
                <option value="nominal">Danh nghĩa</option>
                <option value="purchasing_power">Điều chỉnh lạm phát</option>
              </select>
            </div>
            <div className="grid2">
              <div className="field">
                <label htmlFor="g-inf">Lạm phát</label>
                <input
                  id="g-inf"
                  inputMode="decimal"
                  value={form.inflationRate}
                  onChange={(e) => setForm({ ...form, inflationRate: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="g-buf">Buffer</label>
                <input
                  id="g-buf"
                  inputMode="decimal"
                  value={form.bufferPct}
                  onChange={(e) => setForm({ ...form, bufferPct: e.target.value })}
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="g-prot">Đã bảo vệ</label>
              <input
                id="g-prot"
                inputMode="decimal"
                value={form.protectedAmount}
                onChange={(e) => setForm({ ...form, protectedAmount: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="g-urg">Mức độ</label>
              <select
                id="g-urg"
                value={form.urgency}
                onChange={(e) => setForm({ ...form, urgency: e.target.value as GoalUrgency })}
              >
                <option value="hard">Bắt buộc</option>
                <option value="flexible">Linh hoạt</option>
              </select>
            </div>
            <div className="banner info" style={{ marginBottom: 12 }}>
              Preview: {formatMoney(previewAmount)}
              {form.mode === "purchasing_power" && <> → {formatMoney(previewAdj)}</>}
            </div>
            <div className="stack">
              <button type="button" onClick={save}>
                Lưu
              </button>
              <button type="button" className="secondary" onClick={() => setShow(false)}>
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
