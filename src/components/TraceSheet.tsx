import { useEffect, useId, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  formatTraceValue,
  traceSourceLabel,
  type TraceSheetModel,
} from "../lib/traceModel";

export type {
  TraceLinkModel as TraceLink,
  TraceRowModel as TraceRow,
} from "../lib/traceModel";

type Props = {
  open: boolean;
  onClose: () => void;
  model: TraceSheetModel;
  children?: ReactNode;
};

export function TraceSheet({ open, onClose, model, children }: Props) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="trace-sheet-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section
        className="trace-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-trace-id={model.id}
      >
        <div className="trace-sheet-handle" aria-hidden="true" />
        <button className="trace-sheet-close" type="button" onClick={onClose} aria-label="Đóng chi tiết">
          ×
        </button>
        <header>
          {model.eyebrow && <p className="trace-sheet-eyebrow">{model.eyebrow}</p>}
          <h2 id={titleId}>{model.title}</h2>
          {model.primary && <strong className="trace-sheet-value">{formatTraceValue(model.primary)}</strong>}
          <p className="trace-sheet-explanation">{model.explanation}</p>
        </header>

        <dl className="trace-sheet-rows">
          {model.rows.map((row) => (
            <div
              key={row.id}
              data-trace-source={row.source}
              data-trace-formula={row.formula}
              title={`Nguồn: ${traceSourceLabel(row.source)}${row.formula ? ` · ${row.formula}` : ""}`}
            >
              <dt>{row.label}</dt>
              <dd className={row.tone ? `is-${row.tone}` : undefined}>{formatTraceValue(row.value)}</dd>
            </div>
          ))}
        </dl>

        {model.links && model.links.length > 0 && (
          <div className="trace-sheet-links" aria-label="Liên kết kiểm tra">
            {model.links.map((link) => (
              <Link key={link.to} to={link.to} onClick={onClose}>
                {link.label}
              </Link>
            ))}
          </div>
        )}

        {children && <div className="trace-sheet-actions">{children}</div>}
      </section>
    </div>
  );
}
