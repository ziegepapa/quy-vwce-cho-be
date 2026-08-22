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
import { useLocale } from "../lib/locale";

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
  const { locale } = useLocale();
  const text = locale === "de" ? {
    aria: "Kurse und Vermögenswerte", eyebrow: "Portfolio", title: "Verwendete Kurse", description: "Tippen Sie auf einen Wert, um genau diesen Kurs anzuzeigen oder zu ändern. Jeder Wert wird an nur einer Stelle bearbeitet.",
    empty: "Noch keine Vermögenswerte. Importieren Sie zuerst Transaktionen oder ein PDF.", missing: "Kurs fehlt", automatic: "Automatisch", manual: "Manuell", tap: "Zum Eingeben tippen", source: "Kursquelle", notAvailable: "nicht vorhanden",
    manualPrice: "Manueller Kurs (EUR)", priceDate: "Kursdatum", save: "Speichern", saving: "Wird gespeichert…", cancel: "Abbrechen", deleting: "Wird gelöscht…", removeManual: "Manuellen Kurs löschen", removing: "Wird entfernt…", confirmRemove: "Instrument wirklich entfernen", remove: "Aus Liste entfernen",
    manualHint: "Speichern Sie zuerst einen manuellen Kurs", autoQuote: "Automatisch", manualQuote: "Manuell",
    savedManual: "Manueller Kurs für {name} gespeichert.", clearedManual: "Manueller Kurs gelöscht. {name} verwendet wieder den automatischen Kurs vom {date}.", clearedWithoutQuote: "Manueller Kurs gelöscht. Für {name} ist derzeit kein Kurs vorhanden.", removed: "{name} wurde aus der Kursliste entfernt.",
    cannotSave: "Kurs konnte nicht gespeichert werden.", cannotDelete: "Manueller Kurs konnte nicht gelöscht werden.", cannotRemove: "Instrument konnte nicht entfernt werden.", cannotSwitch: "Kursquelle konnte nicht geändert werden.",
    removableHint: "Dieses Instrument wird von keiner Transaktion mehr verwendet und kann aus der Kursliste entfernt werden. Es erscheint erst wieder nach einem neuen Import oder einer Wiederherstellung.",
  } : {
    aria: "Giá và tài sản", eyebrow: "Danh mục", title: "Giá đang dùng", description: "Chạm vào một mã để xem và sửa giá của đúng mã đó. Mỗi mã chỉ có một chỗ để sửa.",
    empty: "Chưa có tài sản. Nhập giao dịch hoặc PDF trước.", missing: "Thiếu giá", automatic: "Tự động", manual: "Thủ công", tap: "Chạm để nhập", source: "Nguồn giá", notAvailable: "chưa có",
    manualPrice: "Giá thủ công (EUR)", priceDate: "Ngày giá", save: "Lưu", saving: "Đang lưu…", cancel: "Hủy", deleting: "Đang xóa…", removeManual: "Xóa giá thủ công", removing: "Đang bỏ…", confirmRemove: "Chắc chắn bỏ mã", remove: "Bỏ khỏi danh sách",
    manualHint: "Hãy lưu một giá thủ công trước", autoQuote: "Tự động", manualQuote: "Thủ công",
    savedManual: "Đã lưu giá thủ công cho {name}.", clearedManual: "Đã xóa giá thủ công. {name} trở lại giá tự động ngày {date}.", clearedWithoutQuote: "Đã xóa giá thủ công. {name} hiện chưa có giá nào.", removed: "Đã bỏ {name} khỏi danh sách giá.",
    cannotSave: "Không lưu được giá.", cannotDelete: "Không xóa được giá thủ công.", cannotRemove: "Không bỏ được mã này.", cannotSwitch: "Không đổi được nguồn giá.",
    removableHint: "Không còn giao dịch nào dùng mã này nên có thể bỏ khỏi danh sách giá. Bỏ rồi thì mã không tự quay lại, trừ khi bạn nhập lại hoặc nạp một bản sao lưu cũ.",
  };
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
      await afterWrite(text.savedManual.replace("{name}", displayName(state)));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : text.cannotSave);
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
          ? text.clearedManual.replace("{name}", displayName(state)).replace("{date}", formatDateVN(effective.asOf))
          : text.clearedWithoutQuote.replace("{name}", displayName(state)),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : text.cannotDelete);
    } finally {
      setBusy("idle");
    }
  }

  async function removeRow(state: QuoteSelectionState) {
    setBusy("removing");
    setError(null);
    try {
      await removeInstrumentAndQuotes(state.instrumentIsin, { currency: state.currency });
      await afterWrite(text.removed.replace("{name}", displayName(state)));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : text.cannotRemove);
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
      setError(reason instanceof Error ? reason.message : text.cannotSwitch);
    } finally {
      setBusy("idle");
    }
  }

  const working = busy !== "idle";

  return (
    <div className="p40-price-panel" role="tabpanel" aria-label={text.aria}>
      <QuoteFeedRefresh
        onUpdated={async () => {
          await load();
          await onQuotesChanged?.();
        }}
      />

      <section className="p40-price-inventory">
        <div className="p40-price-inventory-head">
          <div>
            <h3>{text.title}</h3>
            <p>{text.description}</p>
          </div>
        </div>

        {note ? (
          <p className="p40-price-status" role="status" aria-live="polite">
            {note}
          </p>
        ) : null}

        {states.length === 0 ? (
          <p className="p40-price-empty">{text.empty}</p>
        ) : (
          <div className="p40-price-list">
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
                <div className={`p40-price-item${open ? " open" : ""}`} key={state.key}>
                  <button
                    type="button"
                    className={`p40-price-row${open ? " selected" : ""}`}
                    aria-expanded={open}
                    onClick={() => toggleEditor(state)}
                  >
                    <span className="p40-price-name">
                      <strong>{name}</strong>
                      <small>{state.instrumentIsin}</small>
                    </span>
                    <span className="p40-price-value">
                      <strong>
                        {effective ? formatMoney(effective.price, state.currency) : text.missing}
                      </strong>
                      <small>
                        {effective
                          ? `${effective.source === "auto" ? text.automatic : text.manual} · ${formatDateVN(effective.asOf)}`
                          : text.tap}
                      </small>
                    </span>
                  </button>

                  {open ? (
                    <div className="p40-price-editor">
                      <div className="p40-price-source-meta">
                        <span className={state.isStale ? "p40-price-source-chip warning" : "p40-price-source-chip"}>
                          {text.automatic}: {candidateStatusLabel(state.autoStatus)}
                        </span>
                        <span className={state.manual ? "p40-price-source-chip" : "p40-price-source-chip muted"}>
                          {text.manual}: {state.manual ? formatDateVN(state.manual.asOf) : text.notAvailable}
                        </span>
                      </div>

                      <div className="p40-price-mode" role="group" aria-label={`${text.source} ${name}`}>
                        <button
                          type="button"
                          className={state.mode === "auto" ? "active" : ""}
                          disabled={working}
                          onClick={() => void switchMode(state, "auto")}
                        >
                          {text.autoQuote}
                        </button>
                        <button
                          type="button"
                          className={state.mode === "manual" ? "active" : ""}
                          disabled={working || !state.manual}
                          title={state.manual ? undefined : text.manualHint}
                          onClick={() => void switchMode(state, "manual")}
                        >
                          {text.manualQuote}
                        </button>
                      </div>

                      <div className="p40-price-fields">
                        <label className="p40-price-field">
                          <span>{text.manualPrice}</span>
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
                        <label className="p40-price-field">
                          <span>{text.priceDate}</span>
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
                        <p className="p40-price-error" role="alert">
                          {error}
                        </p>
                      ) : null}
                      {!error && typedSomething && !checkedDraft.ok ? (
                        <p className="p40-price-form-note">{checkedDraft.message}</p>
                      ) : null}

                      <div className="p40-price-editor-actions">
                        <button
                          type="button"
                          className="p40-price-primary"
                          disabled={working || !checkedDraft.ok}
                          onClick={() => void saveManual(state)}
                        >
                          {busy === "saving" ? text.saving : text.save}
                        </button>
                        <button
                          type="button"
                          className="p40-price-secondary"
                          disabled={working}
                          onClick={closeEditor}
                        >
                          {text.cancel}
                        </button>
                        {state.manual ? (
                          <button
                            type="button"
                            className="p40-price-danger"
                            disabled={working}
                            onClick={() => void clearManual(state)}
                          >
                            {busy === "clearing" ? text.deleting : text.removeManual}
                          </button>
                        ) : null}
                        {removal.ok ? (
                          confirmRemoveKey === state.key ? (
                            <button
                              type="button"
                              className="p40-price-danger"
                              disabled={working}
                              onClick={() => void removeRow(state)}
                            >
                              {busy === "removing" ? text.removing : text.confirmRemove}
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="p40-price-danger"
                              disabled={working}
                              onClick={() => setConfirmRemoveKey(state.key)}
                            >
                              {text.remove}
                            </button>
                          )
                        ) : null}
                      </div>

                      <p className="p40-price-hint">
                        {removal.ok
                          ? text.removableHint
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
