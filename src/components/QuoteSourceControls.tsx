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

  if (states.length === 0) {
    return <p className="settings-empty-note">Chưa có tài sản hoặc giá để lựa chọn nguồn.</p>;
  }

  return (
    <div className="price-source-list">
      {states.map((state) => {
        const name = state.instrument?.ticker || state.instrument?.name || state.instrumentIsin;
        const effective = state.effective;
        return (
          <div className="price-source-row" key={state.key}>
            <div className="price-source-heading">
              <div>
                <strong>{name}</strong>
                <span>{state.instrumentIsin}</span>
              </div>
              <div className="price-source-effective">
                <strong>{effective ? formatPrice(effective.price, state.currency) : "Thiếu giá"}</strong>
                <span>
                  {effective
                    ? `${effective.source === "auto" ? "Tự động" : "Thủ công"} · ${effective.asOf}`
                    : "Chưa có nguồn hiệu lực"}
                </span>
              </div>
            </div>

            <div className="price-source-meta">
              <span className={state.isStale ? "source-chip warning" : "source-chip"}>
                Auto: {candidateStatusLabel(state.autoStatus)}
              </span>
              <span className={state.manual ? "source-chip" : "source-chip muted-chip"}>
                Thủ công: {state.manual ? state.manual.asOf : "chưa có"}
              </span>
            </div>

            <div className="seg-control" role="group" aria-label={`Nguồn giá ${name}`}>
              <button
                type="button"
                className={state.mode === "auto" ? "seg-opt active" : "seg-opt"}
                disabled={busyKey === state.key}
                onClick={() => void choose(state, "auto")}
              >
                Tự động
              </button>
              <button
                type="button"
                className={state.mode === "manual" ? "seg-opt active" : "seg-opt"}
                disabled={busyKey === state.key || !state.manual}
                title={state.manual ? undefined : "Hãy nhập một giá thủ công trước"}
                onClick={() => void choose(state, "manual")}
              >
                Thủ công
              </button>
            </div>
          </div>
        );
      })}
      {error ? <p className="settings-error" role="alert">{error}</p> : null}
    </div>
  );
}
