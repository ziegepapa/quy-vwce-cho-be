import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  candidateStatusLabel,
  listQuoteSelectionStates,
} from "../lib/db";
import type { QuoteSelectionState } from "../lib/db";

function badgeStyle(kind: "auto" | "manual" | "stale" | "missing") {
  const palette = {
    auto: ["#e8f1ff", "#1d4ed8"],
    manual: ["#f5edff", "#7e22ce"],
    stale: ["#fff7e6", "#b45309"],
    missing: ["#feecec", "#b91c1c"],
  } as const;
  const [background, color] = palette[kind];
  return {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: 999,
    padding: "3px 8px",
    background,
    color,
    fontSize: 11,
    fontWeight: 700,
  };
}

export default function QuoteStatusSummary({ refreshKey }: { refreshKey?: number }) {
  const [states, setStates] = useState<QuoteSelectionState[]>([]);

  const reload = useCallback(async () => {
    setStates(await listQuoteSelectionStates());
  }, []);

  useEffect(() => {
    void reload();
  }, [reload, refreshKey]);

  if (states.length === 0) return null;

  return (
    <section className="card" style={{ marginBottom: 12 }} aria-label="Trạng thái nguồn giá">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <strong>Nguồn giá</strong>
        <Link to="/settings" style={{ fontSize: 13 }}>
          Điều chỉnh →
        </Link>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
        {states.map((state) => {
          const name = state.instrument?.ticker || state.instrument?.name || state.instrumentIsin;
          const source = state.effective?.source;
          const kind = !state.effective
            ? "missing"
            : state.isStale
              ? "stale"
              : source === "manual"
                ? "manual"
                : "auto";
          const label = !state.effective
            ? "Thiếu giá"
            : state.isStale
              ? "Auto quá cũ"
              : source === "manual"
                ? "Manual"
                : "Auto";
          return (
            <span key={state.key} style={badgeStyle(kind)} title={`Auto: ${candidateStatusLabel(state.autoStatus)}`}>
              {name}: {label}
            </span>
          );
        })}
      </div>
    </section>
  );
}