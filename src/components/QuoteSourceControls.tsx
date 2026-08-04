import { useCallback, useEffect, useState } from "react";
import {
  candidateStatusLabel,
  listQuoteSelectionStates,
  setQuotePreference,
} from "../lib/db";
import type { QuotePreferenceMode } from "../lib/types";
import type { QuoteSelectionState } from "../lib/db";

function formatPrice(value: number, currency: string): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency,
    maximumFractionDigits: 4,
  }).format(value);
}

export default function QuoteSourceControls({
  refreshKey,
  onChanged,
}: {
  refreshKey?: number;
  onChanged?: () => void | Promise<void>;
}) {
  const [states, setStates] = useState<QuoteSelectionState[]>([]);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setStates(await listQuoteSelectionStates());
  }, []);

  useEffect(() => {
    void reload();
  }, [reload, refreshKey]);

  async function choose(state: QuoteSelectionState, mode: QuotePreferenceMode) {
    if (busyKey) return;
    setBusyKey(state.key);
    setError(null);
    try {
      await setQuotePreference(state.instrumentIsin, mode, { currency: state.currency });
      await reload();
      await onChanged?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="settings-v9">
      <p className="group-label">Nguồn giá & ưu tiên</p>
      <div className="group-box">
        {states.length === 0 ? (
          <p className="group-hint">Chưa có mã hoặc quote để lựa chọn.</p>
        ) : (
          states.map((state, index) => {
            const name = state.instrument?.ticker || state.instrument?.name || state.instrumentIsin;
            const effective = state.effective;
            return (
              <div
                key={state.key}
                style={{
                  borderTop: index === 0 ? undefined : "1px solid var(--border, #e5e7eb)",
                  padding: "12px 0",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <strong>{name}</strong>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {state.instrumentIsin} · {state.currency}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", fontSize: 13 }}>
                    {effective ? formatPrice(effective.price, state.currency) : "Thiếu giá"}
                    <div className="muted" style={{ fontSize: 12 }}>
                      {effective
                        ? `${effective.source === "auto" ? "Tự động" : "Thủ công"} · ${effective.asOf}`
                        : "Không có nguồn hiệu lực"}
                    </div>
                  </div>
                </div>

                <div style={{ margin: "8px 0", fontSize: 12 }}>
                  Auto: {candidateStatusLabel(state.autoStatus)}
                  {state.auto?.provider ? ` · ${state.auto.provider}` : ""}
                  {state.isStale ? " · QUÁ CŨ" : ""}
                  {state.manual ? ` · Manual: ${state.manual.asOf}` : " · Manual: chưa có"}
                </div>

                <div className="seg-control" role="group" aria-label={`Nguồn giá ${name}`}>
                  <button
                    type="button"
                    className={state.mode === "auto" ? "seg-opt active" : "seg-opt"}
                    disabled={busyKey === state.key}
                    onClick={() => void choose(state, "auto")}
                  >
                    Dùng auto
                  </button>
                  <button
                    type="button"
                    className={state.mode === "manual" ? "seg-opt active" : "seg-opt"}
                    disabled={busyKey === state.key || !state.manual}
                    title={state.manual ? undefined : "Hãy lưu một quote thủ công trước"}
                    onClick={() => void choose(state, "manual")}
                  >
                    Giữ manual
                  </button>
                </div>
              </div>
            );
          })
        )}
        {error ? (
          <p role="alert" style={{ color: "var(--danger-600, #b91c1c)", fontSize: 13 }}>
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}