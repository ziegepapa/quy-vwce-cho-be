import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  aiTraceAvailable,
  requestAiTraceExplanation,
} from "../lib/aiTraceExplanation";
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

type AiState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; explanation: string }
  | { status: "error"; message: string };

export default function TraceSheet({
  open,
  onClose,
  model,
  children,
}: Props) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const aiRequestRef = useRef(0);
  const [aiState, setAiState] = useState<AiState>({ status: "idle" });

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    aiRequestRef.current += 1;
    setAiState({ status: "idle" });
  }, [model.id]);

  useEffect(() => {
    if (open) return;
    aiRequestRef.current += 1;
    setAiState({ status: "idle" });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => closeRef.current?.focus());

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = oldOverflow;
      previous?.focus();
    };
  }, [open]);

  const explainWithAi = async () => {
    const requestId = aiRequestRef.current + 1;
    aiRequestRef.current = requestId;
    setAiState({ status: "loading" });
    try {
      const explanation = await requestAiTraceExplanation(model);
      if (aiRequestRef.current !== requestId) return;
      setAiState({ status: "ready", explanation });
    } catch (error) {
      if (aiRequestRef.current !== requestId) return;
      setAiState({
        status: "error",
        message: error instanceof Error
          ? error.message
          : "AI tạm thời không khả dụng. Phần giải thích chuẩn phía trên vẫn dùng được.",
      });
    }
  };

  if (!open) return null;

  return (
    <div
      className="pulse-sheet-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className="pulse-trace-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-trace-id={model.id}
      >
        <div className="pulse-sheet-handle" aria-hidden />
        <header className="pulse-sheet-head">
          <div>
            <p>{model.eyebrow ?? "Vì sao số này?"}</p>
            <h2 id={titleId}>{model.title}</h2>
          </div>
          <button ref={closeRef} type="button" className="pulse-sheet-close" onClick={onClose}>
            <span aria-hidden>×</span>
            <span className="sr-only">Đóng</span>
          </button>
        </header>

        {model.primary ? <p className="pulse-sheet-value">{formatTraceValue(model.primary)}</p> : null}
        <p className="pulse-sheet-explanation">{model.explanation}</p>

        {model.rows.length > 0 ? (
          <dl className="pulse-trace-rows">
            {model.rows.map((row) => (
              <div
                key={row.id}
                data-trace-source={row.source}
                data-trace-formula={row.formula}
                title={`Nguồn: ${traceSourceLabel(row.source)}${row.formula ? ` · ${row.formula}` : ""}`}
              >
                <dt>{row.label}</dt>
                <dd className={row.tone ? `tone-${row.tone}` : undefined}>{formatTraceValue(row.value)}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        {aiTraceAvailable ? (
          <section className="pulse-ai-panel" aria-label="Giải thích AI tùy chọn">
            <div className="pulse-ai-head">
              <strong>AI tùy chọn</strong>
              <span>Chỉ gửi Trace đã lọc</span>
            </div>
            <div className="pulse-ai-live" aria-live="polite">
              {aiState.status === "idle" ? (
                <button type="button" className="pulse-ai-button" onClick={() => void explainWithAi()}>
                  Giải thích thêm bằng AI
                </button>
              ) : null}
              {aiState.status === "loading" ? (
                <p className="pulse-ai-status">Đang tạo giải thích…</p>
              ) : null}
              {aiState.status === "ready" ? (
                <p className="pulse-ai-copy">{aiState.explanation}</p>
              ) : null}
              {aiState.status === "error" ? (
                <>
                  <p className="pulse-ai-error" role="alert">{aiState.message}</p>
                  <button type="button" className="pulse-ai-button" onClick={() => void explainWithAi()}>
                    Thử lại
                  </button>
                </>
              ) : null}
            </div>
            <p className="pulse-ai-note">Không phải tư vấn đầu tư. Giải thích chuẩn phía trên luôn là nguồn tham chiếu.</p>
          </section>
        ) : null}

        {children}

        {model.links && model.links.length > 0 ? (
          <nav className="pulse-sheet-links" aria-label="Đi tới dữ liệu liên quan">
            {model.links.map((link) => (
              <Link key={`${link.to}-${link.label}`} to={link.to} onClick={onClose}>
                {link.label}<span aria-hidden> →</span>
              </Link>
            ))}
          </nav>
        ) : null}
      </div>
    </div>
  );
}
