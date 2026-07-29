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
  statusLabel,
} from "../lib/calc";
import { nowIso } from "../lib/defaults";
import ActionMenu from "../components/ActionMenu";
import { IconPlus } from "../components/Icons";

export default function Goals() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [show, setShow] = useState(false);
  const [edit, setEdit] = useState<Goal | null>(null);
  const [form, setForm] = useState({
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
  });

  async function reload() {
    setGoals(await listGoals());
  }
  useEffect(() => {
    reload();
  }, []);

  const today = new Date();
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
    return { need, protectedSum, nearest, nearestMonths, count: goals.length };
  }, [goals, today]);

  async function save() {
    await upsertGoal({
      id: edit?.id ?? uid("goal"),
      name: form.name,
      dueDate: form.dueDate,
      amount: Number(form.amount) || 0,
      mode: form.mode,
      baseYear: Number(form.baseYear) || 2026,
      inflationRate: Number(form.inflationRate) || 0,
      bufferPct: Number(form.bufferPct) || 0,
      urgency: form.urgency,
      protectedAmount: Number(form.protectedAmount) || 0,
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
  const previewAdj =
    form.mode === "purchasing_power"
      ? inflate(Number(form.amount) || 0, Number(form.inflationRate) || 0, previewYears)
      : Number(form.amount) || 0;

  return (
    <div>
      <div className="row-between" style={{ marginBottom: 4 }}>
        <h1 className="page-title">Mục tiêu</h1>
        <button
          type="button"
          className="fab"
          aria-label="Thêm mục tiêu"
          onClick={() => {
            setEdit(null);
            setForm({
              name: "Mục tiêu",
              dueDate: "2038-06-30",
              amount: "10000",
              mode: "purchasing_power",
              baseYear: "2026",
              inflationRate: "0.02",
              bufferPct: "0.1",
              urgency: "hard",
              protectedAmount: "0",
              notes: "",
            });
            setShow(true);
          }}
        >
          <IconPlus />
        </button>
      </div>

      <div className="card card-hero" style={{ marginBottom: 12 }}>
        <div className="grid2" style={{ gap: 12 }}>
          <div>
            <div className="metric-label">Số mục tiêu</div>
            <div className="metric-value">{summary.count}</div>
          </div>
          <div>
            <div className="metric-label">Cần bảo vệ</div>
            <div className="metric-value">{formatMoney(summary.need)}</div>
          </div>
          <div>
            <div className="metric-label">Đã bảo vệ</div>
            <div className="metric-value">{formatMoney(summary.protectedSum)}</div>
          </div>
          <div>
            <div className="metric-label">Còn thiếu</div>
            <div className="metric-value">
              {formatMoney(Math.max(0, summary.need - summary.protectedSum))}
            </div>
          </div>
        </div>
        {summary.nearest && (
          <p className="muted" style={{ marginBottom: 0, marginTop: 12 }}>
            Gần nhất: {summary.nearest.name} · {summary.nearestMonths} tháng
          </p>
        )}
      </div>

      {!goals.length && (
        <div className="empty card">
          <p>Chưa có mục tiêu.</p>
          <button type="button" onClick={() => setShow(true)}>
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
              <div className="card goal-card">
                <div className="row-between">
                  <div>
                    <strong>{g.name}</strong>
                    <div className="muted">{formatDateVN(g.dueDate)}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span className={`pill ${g.urgency === "hard" ? "red" : "yellow"}`}>
                      {g.urgency === "hard" ? "Bắt buộc" : "Linh hoạt"}
                    </span>
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
                </div>

                <div className="row-between" style={{ marginTop: 10 }}>
                  <div>
                    <div className="metric-value" style={{ fontSize: "1.05rem" }}>
                      {formatMoney(g.amount)}
                      {g.mode === "purchasing_power" && g.amount > 0 && (
                        <span className="muted" style={{ fontWeight: 500, fontSize: ".85rem" }}>
                          {" "}
                          → {formatMoney(adj)}
                        </span>
                      )}
                    </div>
                    <span className={`pill ${status}`} style={{ marginTop: 6 }}>
                      {statusLabel(status)}
                    </span>
                  </div>
                  <div className="progress-ring" aria-label={`${Math.round(pct)}%`}>
                    <svg viewBox="0 0 36 36">
                      <path
                        className="ring-bg"
                        d="M18 2.5a15.5 15.5 0 1 1 0 31 15.5 15.5 0 1 1 0-31"
                      />
                      <path
                        className={`ring-fg ${status}`}
                        strokeDasharray={`${pct}, 100`}
                        d="M18 2.5a15.5 15.5 0 1 1 0 31 15.5 15.5 0 1 1 0-31"
                      />
                      <text x="18" y="20.5" textAnchor="middle" className="ring-text">
                        {Math.round(pct)}%
                      </text>
                    </svg>
                  </div>
                </div>

                <div className="progress-track" style={{ marginTop: 10 }}>
                  <span style={{ width: `${pct}%` }} />
                </div>
                <p className="muted" style={{ margin: "6px 0 0", fontSize: ".8rem" }}>
                  Bảo vệ {formatMoney(g.protectedAmount)} · Thiếu {formatMoney(gap)} · {months} tháng
                </p>
                {gap > 0 && months > 0 && (
                  <p className="muted" style={{ margin: "4px 0 0", fontSize: ".8rem" }}>
                    Cần bảo vệ thêm khoảng {formatMoney(perMonth)}/tháng
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
              <p className="field-hint">Sức mua năm {form.baseYear}</p>
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
              <label htmlFor="g-prot">Đã bảo vệ (cash bucket)</label>
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
                <option value="soft">Linh hoạt</option>
              </select>
            </div>
            <div className="banner info" style={{ marginBottom: 12 }}>
              Preview: {formatMoney(Number(form.amount) || 0)}
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
