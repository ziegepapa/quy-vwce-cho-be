import { useCallback, useEffect, useRef, useState } from "react";
import {
  listInstruments,
  listQuotes,
  saveManualQuoteForIsin,
} from "../lib/db";
import type { Instrument, Quote } from "../lib/types";
import { VWCE_ISIN } from "../lib/types";
import { formatDateVN, formatMoney } from "../lib/calc";
import {
  MANUAL_QUOTE_DRAFT_KEY,
  validateManualQuoteDraft,
} from "../lib/manualQuoteDraft";
import type { ManualQuoteDraft } from "../lib/manualQuoteDraft";
import QuoteFeedRefresh from "./QuoteFeedRefresh";
import QuoteSourceControls from "./QuoteSourceControls";

type QuoteSaveState = "idle" | "dirty" | "saving" | "saved" | "error";

const QUOTE_AUTOSAVE_MS = 900;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function readStoredDraft(): ManualQuoteDraft | null {
  try {
    const raw = window.sessionStorage.getItem(MANUAL_QUOTE_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ManualQuoteDraft>;
    if (
      typeof parsed.isin !== "string" ||
      typeof parsed.price !== "string" ||
      typeof parsed.asOf !== "string"
    ) {
      return null;
    }
    return { isin: parsed.isin, price: parsed.price, asOf: parsed.asOf };
  } catch {
    return null;
  }
}

function rememberDraft(draft: ManualQuoteDraft) {
  try {
    window.sessionStorage.setItem(MANUAL_QUOTE_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* Storage can be unavailable in private mode. IndexedDB save still works. */
  }
}

function forgetDraft() {
  try {
    window.sessionStorage.removeItem(MANUAL_QUOTE_DRAFT_KEY);
  } catch {
    /* */
  }
}

export default function SettingsPricePanel({
  refreshKey,
  onQuotesChanged,
}: {
  refreshKey?: number;
  onQuotesChanged?: () => void | Promise<void>;
}) {
  const storedAtStart = useRef(readStoredDraft());
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [draft, setDraft] = useState<ManualQuoteDraft>(
    storedAtStart.current ?? { isin: VWCE_ISIN, price: "", asOf: todayIso() },
  );
  const [saveState, setSaveState] = useState<QuoteSaveState>("idle");
  const [error, setError] = useState<string | null>(null);

  const initialized = useRef(false);
  const draftRef = useRef(draft);
  const instrumentsRef = useRef<Instrument[]>([]);
  const lastSavedFingerprint = useRef("");
  const timerRef = useRef<number | null>(null);
  const saveRef = useRef<(explicit?: boolean) => Promise<boolean>>(async () => false);
  const onQuotesChangedRef = useRef(onQuotesChanged);

  useEffect(() => {
    onQuotesChangedRef.current = onQuotesChanged;
  }, [onQuotesChanged]);

  const loadAssets = useCallback(async () => {
    const [nextInstruments, nextQuotes] = await Promise.all([listInstruments(), listQuotes()]);
    instrumentsRef.current = nextInstruments;
    setInstruments(nextInstruments);
    setQuotes(nextQuotes);

    if (!initialized.current) {
      initialized.current = true;
      if (!storedAtStart.current) {
        const isin = nextInstruments.some((item) => item.isin === VWCE_ISIN)
          ? VWCE_ISIN
          : nextInstruments[0]?.isin ?? VWCE_ISIN;
        const quote = nextQuotes.find(
          (item) => item.instrumentIsin === isin && item.currency === "EUR",
        );
        const nextDraft = {
          isin,
          price: quote ? String(quote.price) : "",
          asOf: quote?.asOf ?? todayIso(),
        };
        const checked = validateManualQuoteDraft(nextDraft);
        if (checked.ok) lastSavedFingerprint.current = checked.value.fingerprint;
        draftRef.current = nextDraft;
        setDraft(nextDraft);
      }
    }
  }, []);

  useEffect(() => {
    void loadAssets();
  }, [loadAssets, refreshKey]);

  const saveDraft = useCallback(
    async (explicit = false): Promise<boolean> => {
      const checked = validateManualQuoteDraft(draftRef.current);
      if (!checked.ok) {
        if (explicit || checked.reason !== "empty") {
          setError(checked.message);
          setSaveState(checked.reason === "empty" ? "idle" : "error");
        }
        return false;
      }
      if (checked.value.fingerprint === lastSavedFingerprint.current) {
        forgetDraft();
        setError(null);
        setSaveState("saved");
        return true;
      }

      setError(null);
      setSaveState("saving");
      try {
        const instrument = instrumentsRef.current.find(
          (item) => item.isin === checked.value.instrumentIsin,
        );
        await saveManualQuoteForIsin({
          instrumentIsin: checked.value.instrumentIsin,
          price: checked.value.price,
          asOf: checked.value.asOf,
          venue: instrument?.venue,
          name: instrument?.name,
        });
        lastSavedFingerprint.current = checked.value.fingerprint;
        forgetDraft();
        setSaveState("saved");
        await loadAssets();
        await onQuotesChangedRef.current?.();
        return true;
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Không lưu được giá.");
        setSaveState("error");
        return false;
      }
    },
    [loadAssets],
  );

  useEffect(() => {
    saveRef.current = saveDraft;
  }, [saveDraft]);

  useEffect(() => {
    draftRef.current = draft;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);

    const checked = validateManualQuoteDraft(draft);
    if (!checked.ok) {
      rememberDraft(draft);
      if (checked.reason === "empty") setSaveState("idle");
      return;
    }
    if (checked.value.fingerprint === lastSavedFingerprint.current) {
      forgetDraft();
      if (saveState !== "saving") setSaveState("saved");
      return;
    }

    rememberDraft(draft);
    setSaveState("dirty");
    timerRef.current = window.setTimeout(() => {
      void saveRef.current(false);
    }, QUOTE_AUTOSAVE_MS);
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, [draft]);

  useEffect(() => {
    const saveWhenHidden = () => {
      if (document.visibilityState === "hidden") void saveRef.current(false);
    };
    window.addEventListener("pagehide", saveWhenHidden);
    document.addEventListener("visibilitychange", saveWhenHidden);
    return () => {
      window.removeEventListener("pagehide", saveWhenHidden);
      document.removeEventListener("visibilitychange", saveWhenHidden);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);

      const checked = validateManualQuoteDraft(draftRef.current);
      if (checked.ok && checked.value.fingerprint !== lastSavedFingerprint.current) {
        const instrument = instrumentsRef.current.find(
          (item) => item.isin === checked.value.instrumentIsin,
        );
        void saveManualQuoteForIsin({
          instrumentIsin: checked.value.instrumentIsin,
          price: checked.value.price,
          asOf: checked.value.asOf,
          venue: instrument?.venue,
          name: instrument?.name,
        }).then(forgetDraft, () => undefined);
      }
    };
  }, []);

  function patchDraft(partial: Partial<ManualQuoteDraft>) {
    const next = { ...draftRef.current, ...partial };
    draftRef.current = next;
    rememberDraft(next);
    setError(null);
    setDraft(next);
  }

  function quoteFor(isin: string): Quote | undefined {
    return quotes.find((item) => item.instrumentIsin === isin && item.currency === "EUR");
  }

  function selectAsset(isin: string) {
    const quote = quoteFor(isin);
    const next = {
      isin,
      price: quote ? String(quote.price) : "",
      asOf: quote?.asOf ?? todayIso(),
    };
    const checked = validateManualQuoteDraft(next);
    lastSavedFingerprint.current = checked.ok ? checked.value.fingerprint : "";
    forgetDraft();
    draftRef.current = next;
    setDraft(next);
    setError(null);
    setSaveState(checked.ok ? "saved" : "idle");
  }

  const checkedDraft = validateManualQuoteDraft(draft);
  const stateLabel =
    saveState === "saving"
      ? "Đang lưu…"
      : saveState === "dirty"
        ? "Sẽ tự lưu"
        : saveState === "saved"
          ? "Đã lưu"
          : saveState === "error"
            ? "Cần kiểm tra"
            : "Chưa thay đổi";

  return (
    <div className="settings-panel" role="tabpanel" aria-label="Giá và tài sản">
      <QuoteFeedRefresh
        onUpdated={async () => {
          await loadAssets();
          await onQuotesChangedRef.current?.();
        }}
      />

      <section className="settings-card">
        <div className="settings-card-head">
          <div>
            <p className="settings-card-eyebrow">Danh mục</p>
            <h3>Giá đang dùng</h3>
            <p>Chọn một tài sản để chỉnh giá. Mỗi ISIN luôn có giá riêng.</p>
          </div>
          <span className="settings-icon-bubble" aria-hidden>€</span>
        </div>
        {instruments.length === 0 ? (
          <p className="settings-empty-note">Chưa có tài sản. Nhập giao dịch hoặc PDF trước.</p>
        ) : (
          <div className="asset-price-list">
            {instruments.map((instrument) => {
              const quote = quoteFor(instrument.isin);
              const selected = draft.isin.replace(/\s/g, "").toUpperCase() === instrument.isin;
              return (
                <button
                  key={instrument.isin}
                  type="button"
                  className={`asset-price-row${selected ? " selected" : ""}`}
                  onClick={() => selectAsset(instrument.isin)}
                >
                  <span className="asset-price-name">
                    <strong>{instrument.ticker || instrument.name || instrument.isin}</strong>
                    <small>{instrument.isin}</small>
                  </span>
                  <span className="asset-price-value">
                    <strong>{quote ? formatMoney(quote.price, quote.currency) : "Thiếu giá"}</strong>
                    <small>
                      {quote
                        ? `${quote.source === "auto" ? "Tự động" : "Thủ công"} · ${formatDateVN(quote.asOf)}`
                        : "Chạm để nhập"}
                    </small>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="settings-card manual-price-card">
        <div className="settings-card-head compact-head">
          <div>
            <p className="settings-card-eyebrow">Thủ công</p>
            <h3>Nhập giá</h3>
            <p>Giá hợp lệ được tự lưu sau khi bạn ngừng nhập hoặc chuyển màn hình.</p>
          </div>
          <span className={`settings-save-pill quote-state-${saveState}`}>{stateLabel}</span>
        </div>

        <div className="settings-field-grid quote-editor-grid">
          <label className="setting-field quote-isin-field">
            <span>ISIN</span>
            <input
              list="settings-instruments"
              value={draft.isin}
              autoCapitalize="characters"
              onChange={(event) => patchDraft({ isin: event.target.value })}
            />
            <datalist id="settings-instruments">
              {instruments.map((instrument) => (
                <option key={instrument.isin} value={instrument.isin}>
                  {instrument.ticker || instrument.name}
                </option>
              ))}
            </datalist>
          </label>
          <label className="setting-field">
            <span>Giá (EUR)</span>
            <input
              inputMode="decimal"
              value={draft.price}
              placeholder="167,54"
              onChange={(event) => patchDraft({ price: event.target.value })}
              onBlur={() => void saveDraft(false)}
            />
          </label>
          <label className="setting-field">
            <span>Ngày giá</span>
            <input
              type="date"
              value={draft.asOf}
              max={todayIso()}
              onChange={(event) => patchDraft({ asOf: event.target.value })}
              onBlur={() => void saveDraft(false)}
            />
          </label>
        </div>
        {error ? <p className="settings-error" role="alert">{error}</p> : null}
        {!error && !checkedDraft.ok && checkedDraft.reason !== "empty" ? (
          <p className="settings-form-note">{checkedDraft.message}</p>
        ) : null}
        <div className="settings-action-row">
          <p>Dữ liệu nhập dở cũng được giữ trong tab này cho đến khi lưu thành công.</p>
          <button
            type="button"
            className="settings-secondary-action"
            disabled={saveState === "saving"}
            onClick={() => void saveDraft(true)}
          >
            Lưu ngay
          </button>
        </div>
      </section>

      <details className="settings-disclosure">
        <summary>
          <span>
            <strong>Quy tắc chọn nguồn giá</strong>
            <small>Chỉ cần mở khi muốn giữ giá thủ công thay cho giá tự động.</small>
          </span>
          <span className="disclosure-chevron" aria-hidden>›</span>
        </summary>
        <div className="settings-disclosure-body">
          <QuoteSourceControls refreshKey={refreshKey} onChanged={onQuotesChanged} />
        </div>
      </details>
    </div>
  );
}
