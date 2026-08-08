import { useCallback, useEffect, useState } from "react";
import {
  candidateStatusLabel,
  deleteManualQuoteForIsin,
  listQuoteSelectionStates,
  listTransactions,
  removeInstrumentAndQuotes,
  saveManualQuoteForIsin,
  setQuotePreference,
} from "../lib/db";
import type { QuoteSelectionState } from "../lib/db";
import type { QuotePreferenceMode, Transaction } from "../lib/types";
import { formatDateVN, formatMoney } from "../lib/calc";
import { validateManualQuoteDraft } from "../lib/manualQuoteDraft";
import { canRemoveFromPriceList } from "../lib/priceListRemoval";
import QuoteFeedRefresh from "./QuoteFeedRefresh";

type RowDraft = { price: string; asOf: string };
type BusyKind = "idle" | "saving" | "clearing" | "removing" | "switching";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function displayName(state: QuoteSelectionState): string {
  return state.instrument?.ticker || state.instrument?.name || state.instrumentIsin;
}

/**
 * QUOTE-MANUAL-UX-001 r1 — one ISIN, one place to edit it.
 *
 * There is deliberately no autosave here. The previous version saved every valid
 * draft after 900ms, saved again from an unmount cleanup, and kept the draft in
 * sessionStorage, which is why a half-typed price could not be taken back. With
 * an explicit Luu button, Hủy can actually mean Hủy.
 */
export default function SettingsPricePanel({
  refreshKey,
  onQuotesChanged,
}: {
  refreshKey?: number;
  onQuotesChanged?: () => void | Promise<void>;
}) {
  const [states, setStates] = useState<QuoteSelectionState[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<RowDraft>({ price: "", asOf: todayIso() });
  const [busy, setBusy] = useState<BusyKind>("idle");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [confirmRemoveKey, setConfirmRemoveKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [nextStates, nextTransactions] = await Promise.all([
      listQuoteSelectionStates(),
      listTransactions(),
    ]);
    setStates(nextStates);
    setTransactions(nextTransactions);
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  function closeEditor() {
    setOpenKey(null);
    setConfirmRemoveKey(null);
    setError(null);
    setDraft({ price: "", asOf: todayIso() });
  }

  function toggleEditor(state: QuoteSelectionState) {
    if (openKey === state.key) {
      closeEditor();
      return;
    }
    setOpenKey(state.key);
    setConfirmRemoveKey(null);
    setError(null);
    setNote(null);
    // Prefilled from the manual candidate only. Copying the fetched auto price in
    // here would let one tap on Luu turn it into a manual price nobody entered.
    setDraft({
      price: state.manual ? String(state.manual.price) : "",
      asOf: state.manual?.asOf ?? todayIso(),
    });
  }

  async function afterWrite(message: string) {
    setNote(message);
    closeEditor();
    await load();
    await onQuotesChanged?.();
  }

  async function saveManual(state: QuoteSelectionState) {
    const checked = validateManualQuoteDraft({
      isin: state.instrumentIsin,
      price: draft.price,
      asOf: draft.asOf,
    });
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setBusy("saving");
    setError(null);
    try {
      await saveManualQuoteForIsin({
        instrumentIsin: checked.value.instrumentIsin,
        price: checked.value.price,
        asOf: checked.value.asOf,
        venue: state.instrument?.venue,
        name: state.instrument?.name,
      });
      await afterWrite(`Đã lưu giá thủ công cho ${displayName(state)}.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không lưu được giá.");
    } finally {
      setBusy("idle");
    }
  }

  async function clearManual(state: QuoteSelectionState) {
    setBusy("clearing");
    setError(null);
    try {
      const effective = await deleteManualQuoteForIsin(state.instrumentIsin, {
        currency: state.currency,
      });
      await afterWrite(
        effective
          ? `Đã xóa giá thủ công. ${displayName(state)} trở lại giá tự động ngày ${formatDateVN(effective.asOf)}.`
          : `Đã xóa giá thủ công. ${displayName(state)} hiện chưa có giá nào.`,
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không xóa được giá thủ công.");
    } finally {
      setBusy("idle");
    }
  }

  async function removeRow(state: QuoteSelectionState) {
    setBusy("removing");
    setError(null);
    try {
      await removeInstrumentAndQuotes(state.instrumentIsin, { currency: state.currency });
      await afterWrite(`Đã bỏ ${displayName(state)} khỏi danh sách giá.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không bỏ được mã này.");
    } finally {
      setBusy("idle");
    }
  }

  async function switchMode(state: QuoteSelectionState, mode: QuotePreferenceMode) {
    if (state.mode === mode) return;
    setBusy("switching");
    setError(null);
    setNote(null);
    try {
      await setQuotePreference(state.instrumentIsin, mode, { currency: state.currency });
      await load();
      await onQuotesChanged?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không đổi được nguồn giá.");
    } finally {
      setBusy("idle");
    }
  }

  const working = busy !== "idle";

  return (
    <div className="settings-panel" role="tabpanel" aria-label="Giá và tài sản">
      <QuoteFeedRefresh
        onUpdated={async () => {
          await load();
          await onQuotesChanged?.();
        }}
      />

      <section className="settings-card">
        <div className="settings-card-head">
          <div>
            <p className="settings-card-eyebrow">Danh mục</p>
            <h3>Giá đang dùng</h3>
            <p>Chạm vào một mã để xem và sửa giá của đúng mã đó. Mỗi mã chỉ có một chỗ để sửa.</p>
          </div>
          <span className="settings-icon-bubble" aria-hidden>€</span>
        </div>

        {note ? (
          <p className="settings-inline-status success" role="status" aria-live="polite">
            {note}
          </p>
        ) : null}

        {states.length === 0 ? (
          <p className="settings-empty-note">Chưa có tài sản. Nhập giao dịch hoặc PDF trước.</p>
        ) : (
          <div className="asset-price-list">
            {states.map((state) => {
              const open = openKey === state.key;
              const name = displayName(state);
              const effective = state.effective;
              const removal = canRemoveFromPriceList({
                isin: state.instrumentIsin,
                transactions,
              });
              const checkedDraft = validateManualQuoteDraft({
                isin: state.instrumentIsin,
                price: draft.price,
                asOf: draft.asOf,
              });
              const typedSomething = draft.price.trim() !== "";

              return (
                <div className={`asset-price-item${open ? " open" : ""}`} key={state.key}>
                  <button
                    type="button"
                    className={`asset-price-row${open ? " selected" : ""}`}
                    aria-expanded={open}
                    onClick={() => toggleEditor(state)}
                  >
                    <span className="asset-price-name">
                      <strong>{name}</strong>
                      <small>{state.instrumentIsin}</small>
                    </span>
                    <span className="asset-price-value">
                      <strong>
                        {effective ? formatMoney(effective.price, state.currency) : "Thiếu giá"}
                      </strong>
                      <small>
                        {effective
                          ? `${effective.source === "auto" ? "Tự động" : "Thủ công"} · ${formatDateVN(effective.asOf)}`
                          : "Chạm để nhập"}
                      </small>
                    </span>
                  </button>

                  {open ? (
                    <div className="asset-price-editor">
                      <div className="price-source-meta">
                        <span className={state.isStale ? "source-chip warning" : "source-chip"}>
                          Tự động: {candidateStatusLabel(state.autoStatus)}
                        </span>
                        <span className={state.manual ? "source-chip" : "source-chip muted-chip"}>
                          Thủ công: {state.manual ? formatDateVN(state.manual.asOf) : "chưa có"}
                        </span>
                      </div>

                      <div className="seg-control" role="group" aria-label={`Nguồn giá ${name}`}>
                        <button
                          type="button"
                          className={state.mode === "auto" ? "seg-opt active" : "seg-opt"}
                          disabled={working}
                          onClick={() => void switchMode(state, "auto")}
                        >
                          Tự động
                        </button>
                        <button
                          type="button"
                          className={state.mode === "manual" ? "seg-opt active" : "seg-opt"}
                          disabled={working || !state.manual}
                          title={state.manual ? undefined : "Hãy lưu một giá thủ công trước"}
                          onClick={() => void switchMode(state, "manual")}
                        >
                          Thủ công
                        </button>
                      </div>

                      <div className="settings-field-grid quote-editor-grid">
                        <label className="setting-field">
                          <span>Giá thủ công (EUR)</span>
                          <input
                            inputMode="decimal"
                            value={draft.price}
                            placeholder={effective ? String(effective.price) : "167,54"}
                            onChange={(event) => {
                              setError(null);
                              setDraft((prev) => ({ ...prev, price: event.target.value }));
                            }}
                          />
                        </label>
                        <label className="setting-field">
                          <span>Ngày giá</span>
                          <input
                            type="date"
                            value={draft.asOf}
                            max={todayIso()}
                            onChange={(event) => {
                              setError(null);
                              setDraft((prev) => ({ ...prev, asOf: event.target.value }));
                            }}
                          />
                        </label>
                      </div>

                      {error ? (
                        <p className="settings-error" role="alert">
                          {error}
                        </p>
                      ) : null}
                      {!error && typedSomething && !checkedDraft.ok ? (
                        <p className="settings-form-note">{checkedDraft.message}</p>
                      ) : null}

                      <div className="editor-actions">
                        <button
                          type="button"
                          className="settings-primary-action"
                          disabled={working || !checkedDraft.ok}
                          onClick={() => void saveManual(state)}
                        >
                          {busy === "saving" ? "Đang lưu…" : "Lưu"}
                        </button>
                        <button
                          type="button"
                          className="settings-secondary-action"
                          disabled={working}
                          onClick={closeEditor}
                        >
                          Hủy
                        </button>
                        {state.manual ? (
                          <button
                            type="button"
                            className="danger-link"
                            disabled={working}
                            onClick={() => void clearManual(state)}
                          >
                            {busy === "clearing" ? "Đang xóa…" : "Xóa giá thủ công"}
                          </button>
                        ) : null}
                        {removal.ok ? (
                          confirmRemoveKey === state.key ? (
                            <button
                              type="button"
                              className="danger-link"
                              disabled={working}
                              onClick={() => void removeRow(state)}
                            >
                              {busy === "removing" ? "Đang bỏ…" : "Chắc chắn bỏ mã"}
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="danger-link"
                              disabled={working}
                              onClick={() => setConfirmRemoveKey(state.key)}
                            >
                              Bỏ khỏi danh sách
                            </button>
                          )
                        ) : null}
                      </div>

                      <p className="editor-hint">
                        {removal.ok
                          ? "Không còn giao dịch nào dùng mã này nên có thể bỏ khỏi danh sách giá. Bỏ rồi thì mã không tự quay lại, trừ khi bạn nhập lại hoặc nạp một bản sao lưu cũ."
                          : removal.message}
                      </p>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
