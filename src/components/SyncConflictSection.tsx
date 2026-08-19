import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { listConflicts, resolveConflict } from "../lib/sync/engine";
import type { ConflictRecord, EntityTable, ResolveConflictResult } from "../lib/sync/types";
import { useLocale } from "../lib/locale";

export const SYNC_CONFLICTS_SECTION_ID = "sync-conflicts";
export const SYNC_CONFLICT_FOCUS_STATE_KEY = "syncConflictFocusToken";

export type LogoutBlockerCounts = {
  pending: number;
  dead: number;
  conflicts: number;
};

type ConflictChoice = "local" | "remote";
type FeedbackTone = "success" | "pending" | "warning";

type ConflictDisplayItem = {
  id: string;
  entityLabel: string;
  detectedAt: string | null;
  localUpdatedAt: string | null;
  remoteUpdatedAt: string | null;
  remoteDeleted: boolean;
};

type PendingChoice = {
  conflictId: string;
  choice: ConflictChoice;
  entityLabel: string;
  remoteDeleted: boolean;
};

type ResolutionFeedback = {
  tone: FeedbackTone;
  message: string;
};

type SyncConflictSectionProps = {
  userId: string;
  focusRequest?: string | null;
  onResolved: () => void | Promise<void>;
  onSyncNow?: () => void | Promise<unknown>;
};

function syncStrings(locale: "vi" | "de") {
  return locale === "de" ? {
    settings: "Einstellungen", goals: "Ziele", transactions: "Transaktionen", annualChecklists: "Jahres-Checklisten", monthlySnapshots: "Monatsübersichten",
    eyebrow: "Synchronisierung erfordert eine Entscheidung", paused: "Die Synchronisierung wurde angehalten, damit keine Daten überschrieben oder verloren gehen. Wählen Sie für jeden Eintrag die zu behaltende Version.",
    conflictHeading: (count: number) => `${count} Datenkonflikt${count === 1 ? "" : "e"} erfordert${count === 1 ? "" : "n"} eine Entscheidung`, conflictAria: (entity: string) => `Datenkonflikt ${entity}`,
    detected: "Erkannt", deviceUpdated: "Gerät aktualisiert", serverUpdated: "Server aktualisiert", serverDeleted: "Die Serverversion wurde gelöscht",
    keepLocal: "Daten auf diesem Gerät behalten", useRemote: "Synchronisierte Daten verwenden", processing: "Wird verarbeitet…", confirmEyebrow: "Auswahl bestätigen", back: "Zurück, nichts ändern",
    localConfirmText: "Die Version auf diesem Gerät wird behalten und erneut zur Synchronisierung gesendet.", remoteDeletedConfirmText: "Die Serverversion wurde gelöscht. Beim Fortfahren wird der Löschstatus auf dieses Gerät angewendet.", remoteConfirmText: "Die Version auf diesem Gerät wird durch die aktuelle Serverversion ersetzt.",
    localConfirm: "Lokale Daten behalten bestätigen", remoteDeletedConfirm: "Löschung übernehmen bestätigen", remoteConfirm: "Synchronisierte Daten übernehmen bestätigen",
    noConflicts: "Keine offenen Datenkonflikte", noConflictsBody: "Die Konfliktprüfung ist abgeschlossen. Sie können die Synchronisierung bei Bedarf erneut ausführen.", syncNow: "Jetzt synchronisieren", retrying: "Wird erneut geladen…", retry: "Erneut laden", readFailed: "Konfliktstatus konnte nicht gelesen werden", readFailedBody: "Ihre Daten wurden nicht verändert.",
    resolvedLocal: "Die Daten auf diesem Gerät wurden behalten und erfolgreich synchronisiert.", resolvedLocalPending: "Die Daten auf diesem Gerät wurden behalten. Die Änderung wartet noch auf die Synchronisierung; Serverdaten wurden nicht überschrieben.", resolvedLocalConflict: "Die Auswahl wurde lokal gespeichert, aber der Serverstatus hat sich geändert oder konnte nicht sicher aktualisiert werden. Es wurden keine Daten überschrieben. Prüfen Sie den neuen Konflikt.", resolvedDeleted: "Der Löschstatus des Servers wurde übernommen.", resolvedRemote: "Die aktuelle Serverversion wurde übernommen.", needsNetwork: "Der Serverstatus konnte nicht geprüft werden. Daten wurden nicht verändert.", failed: "Die Auswahl konnte nicht übernommen werden. Daten bleiben unverändert.", unexpected: "Der Konflikt konnte nicht verarbeitet werden. Daten bleiben unverändert.",
  } : {
    settings: "Cài đặt", goals: "Mục tiêu", transactions: "Giao dịch", annualChecklists: "Checklist hằng năm", monthlySnapshots: "Tổng hợp tháng",
    eyebrow: "Đồng bộ cần quyết định", paused: "Đồng bộ đã dừng để tránh ghi đè hoặc làm mất dữ liệu. Hãy chọn rõ bản dữ liệu cần giữ cho từng mục.",
    conflictHeading: (count: number) => `${count} xung đột cần xử lý`, conflictAria: (entity: string) => `Xung đột ${entity}`,
    detected: "Phát hiện", deviceUpdated: "Thiết bị cập nhật", serverUpdated: "Server cập nhật", serverDeleted: "Bản trên server đã bị xóa",
    keepLocal: "Giữ dữ liệu trên thiết bị này", useRemote: "Dùng dữ liệu đã đồng bộ", processing: "Đang xử lý…", confirmEyebrow: "Xác nhận lựa chọn", back: "Quay lại, chưa thay đổi",
    localConfirmText: "Bản trên thiết bị sẽ được giữ và gửi lại để đồng bộ.", remoteDeletedConfirmText: "Bản trên server đang bị xóa. Nếu tiếp tục, trạng thái xóa trên server sẽ được áp dụng trên thiết bị này.", remoteConfirmText: "Bản trên thiết bị sẽ bị thay bằng bản server hiện tại.",
    localConfirm: "Xác nhận giữ dữ liệu trên thiết bị này", remoteDeletedConfirm: "Xác nhận áp dụng bản đã xóa", remoteConfirm: "Xác nhận dùng dữ liệu đã đồng bộ",
    noConflicts: "Không có xung đột dữ liệu đang mở", noConflictsBody: "Đã kiểm tra xung đột. Bạn có thể đồng bộ lại khi cần.", syncNow: "Đồng bộ ngay", retrying: "Đang tải lại…", retry: "Thử tải lại", readFailed: "Không thể đọc trạng thái xung đột", readFailedBody: "Dữ liệu chưa bị thay đổi.",
    resolvedLocal: "Đã giữ dữ liệu trên thiết bị và đồng bộ thành công.", resolvedLocalPending: "Đã giữ dữ liệu trên thiết bị. Thay đổi đang chờ đồng bộ; dữ liệu server chưa bị ghi đè.", resolvedLocalConflict: "Đã lưu lựa chọn trên thiết bị, nhưng trạng thái server đã thay đổi hoặc chưa thể cập nhật an toàn. Không có dữ liệu bị ghi đè. Vui lòng xem xung đột mới.", resolvedDeleted: "Đã áp dụng trạng thái bản trên server đã bị xóa.", resolvedRemote: "Đã dùng bản dữ liệu hiện tại trên server.", needsNetwork: "Chưa thể xác minh trạng thái server. Dữ liệu chưa bị thay đổi.", failed: "Không thể áp dụng lựa chọn. Dữ liệu được giữ nguyên.", unexpected: "Không thể xử lý xung đột. Dữ liệu vẫn được giữ nguyên.",
  };
}

type SyncStrings = ReturnType<typeof syncStrings>;

function entityLabel(table: EntityTable, text: SyncStrings): string {
  return text[table];
}

let focusTokenSequence = 0;

function newFocusToken(): string {
  focusTokenSequence += 1;
  return `${Date.now()}-${focusTokenSequence}`;
}

function validDateLabel(value: unknown, locale: "vi" | "de"): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "vi-VN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

function toDisplayItem(conflict: ConflictRecord, locale: "vi" | "de", text: SyncStrings): ConflictDisplayItem {
  return {
    id: conflict.id,
    entityLabel: entityLabel(conflict.table, text),
    detectedAt: validDateLabel(conflict.detectedAt, locale),
    localUpdatedAt: validDateLabel(conflict.localUpdatedAt, locale),
    remoteUpdatedAt: validDateLabel(conflict.remoteUpdatedAt, locale),
    remoteDeleted: validDateLabel(conflict.remoteDeletedAt, locale) !== null,
  };
}

function completedFeedback(result: ResolveConflictResult, text: SyncStrings): ResolutionFeedback | null {
  if (result.status === "resolved-local") return { tone: "success", message: text.resolvedLocal };
  if (result.status === "resolved-local-sync-pending") return { tone: "pending", message: text.resolvedLocalPending };
  if (result.status === "resolved-local-pending-conflict") return { tone: "warning", message: text.resolvedLocalConflict };
  if (result.status === "remote-deleted") return { tone: "success", message: text.resolvedDeleted };
  if (result.status === "resolved-remote") return { tone: "success", message: text.resolvedRemote };
  return null;
}

function safeFailureMessage(result: ResolveConflictResult, text: SyncStrings): string {
  return result.status === "needs-network-verification" ? text.needsNetwork : text.failed;
}

export function hasLogoutBlockers(value: LogoutBlockerCounts): boolean {
  return value.pending > 0 || value.dead > 0 || value.conflicts > 0;
}

export function reconcileVisibleLogoutBlockers(
  current: LogoutBlockerCounts | null,
  refreshed: LogoutBlockerCounts,
): LogoutBlockerCounts | null {
  if (current === null) return null;
  return hasLogoutBlockers(refreshed) ? refreshed : null;
}

export function conflictCtaLabel(count: number, locale: "vi" | "de" = "vi"): string {
  if (locale === "de") return count === 1 ? "1 Konflikt behandeln" : `${count} Konflikte behandeln`;
  return count === 1 ? "Xử lý 1 xung đột" : `Xử lý ${count} xung đột`;
}

export function readSyncConflictFocusToken(state: unknown): string | null {
  if (!state || typeof state !== "object" || Array.isArray(state)) return null;
  const token = (state as Record<string, unknown>)[SYNC_CONFLICT_FOCUS_STATE_KEY];
  return typeof token === "string" && token.length > 0 ? token : null;
}

export async function focusSyncConflictSection(options: {
  attempts?: number;
  delayMs?: number;
} = {}): Promise<boolean> {
  if (typeof document === "undefined") return false;
  const attempts = Math.max(1, options.attempts ?? 12);
  const delayMs = Math.max(0, options.delayMs ?? 50);

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const section = document.getElementById(SYNC_CONFLICTS_SECTION_ID);
    if (section) {
      try {
        if (typeof section.scrollIntoView === "function") {
          section.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        section.focus({ preventScroll: true });
      } catch {
        try {
          section.focus();
        } catch {
          return false;
        }
      }
      return true;
    }
    if (attempt + 1 < attempts) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, delayMs));
    }
  }
  return false;
}

export function openSyncConflictSection(options: {
  pathname: string;
  search: string;
  navigate: (to: string, options?: { state?: unknown }) => void;
  focus?: () => boolean | Promise<boolean>;
  token?: string;
}): "focused" | "navigated" {
  const onDataTab =
    options.pathname === "/settings" && new URLSearchParams(options.search).get("tab") === "data";
  if (onDataTab) {
    const focus = options.focus ?? focusSyncConflictSection;
    try {
      void Promise.resolve(focus()).catch(() => undefined);
    } catch {
      // A conflict may have been resolved before the section rendered.
    }
    return "focused";
  }

  options.navigate("/settings?tab=data", {
    state: {
      [SYNC_CONFLICT_FOCUS_STATE_KEY]: options.token ?? newFocusToken(),
    },
  });
  return "navigated";
}

export default function SyncConflictSection({
  userId,
  focusRequest = null,
  onResolved,
  onSyncNow,
}: SyncConflictSectionProps) {
  const { locale } = useLocale();
  const text = useMemo(() => syncStrings(locale), [locale]);
  const [conflicts, setConflicts] = useState<ConflictDisplayItem[] | null>(null);
  const [conflictReadFailed, setConflictReadFailed] = useState(false);
  const [retryingRead, setRetryingRead] = useState(false);
  const [syncingNow, setSyncingNow] = useState(false);
  const [pendingChoice, setPendingChoice] = useState<PendingChoice | null>(null);
  const [inFlight, setInFlight] = useState<Set<string>>(() => new Set());
  const [cardFeedback, setCardFeedback] = useState<Record<string, string>>({});
  const [resolutionFeedback, setResolutionFeedback] = useState<ResolutionFeedback | null>(null);
  const mounted = useRef(true);
  const handledFocusRequest = useRef<string | null>(null);
  const inFlightIds = useRef(new Set<string>());
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const confirmRef = useRef<HTMLButtonElement | null>(null);

  const refreshConflicts = useCallback(async () => {
    try {
      const unresolved = await listConflicts();
      if (mounted.current) {
        setConflicts(unresolved.map((conflict) => toDisplayItem(conflict, locale, text)));
        setConflictReadFailed(false);
      }
    } catch {
      if (mounted.current) setConflictReadFailed(true);
    }
  }, [locale, text]);

  const refreshBlockers = useCallback(async () => {
    try {
      await onResolved();
    } catch {
      // The next app refresh or logout attempt re-reads all blocker counts.
    }
  }, [onResolved]);

  const retryConflictRead = useCallback(async () => {
    setRetryingRead(true);
    try {
      await refreshConflicts();
    } finally {
      if (mounted.current) setRetryingRead(false);
    }
  }, [refreshConflicts]);

  const syncCleanState = useCallback(async () => {
    if (!onSyncNow || syncingNow || conflictReadFailed || !conflicts || conflicts.length > 0) return;
    setSyncingNow(true);
    try {
      await onSyncNow();
      await refreshConflicts();
    } finally {
      if (mounted.current) setSyncingNow(false);
    }
  }, [conflictReadFailed, conflicts, onSyncNow, refreshConflicts, syncingNow]);

  useEffect(() => {
    mounted.current = true;
    void refreshConflicts();
    return () => {
      mounted.current = false;
    };
  }, [refreshConflicts]);

  useEffect(() => {
    if (
      !focusRequest ||
      (conflicts === null && !conflictReadFailed) ||
      handledFocusRequest.current === focusRequest
    ) return;
    handledFocusRequest.current = focusRequest;
    if (conflictReadFailed || (conflicts && conflicts.length > 0)) {
      void focusSyncConflictSection();
    }
  }, [conflictReadFailed, conflicts, focusRequest]);

  useEffect(() => {
    if (!pendingChoice) return;
    window.setTimeout(() => cancelRef.current?.focus(), 0);
  }, [pendingChoice]);

  function returnFocusToTrigger() {
    const trigger = triggerRef.current;
    window.setTimeout(() => {
      if (trigger?.isConnected) trigger.focus();
    }, 0);
  }

  function closeConfirmation(returnFocus = true) {
    if (pendingChoice && inFlightIds.current.has(pendingChoice.conflictId)) return;
    setPendingChoice(null);
    if (returnFocus) returnFocusToTrigger();
  }

  function beginChoice(
    event: React.MouseEvent<HTMLButtonElement>,
    conflict: ConflictDisplayItem,
    choice: ConflictChoice,
  ) {
    if (conflictReadFailed || inFlightIds.current.has(conflict.id)) return;
    triggerRef.current = event.currentTarget;
    setResolutionFeedback(null);
    setPendingChoice({
      conflictId: conflict.id,
      choice,
      entityLabel: conflict.entityLabel,
      remoteDeleted: conflict.remoteDeleted,
    });
  }

  function handleDialogKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!pendingChoice) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeConfirmation();
      return;
    }
    if (event.key !== "Tab") return;
    const first = cancelRef.current;
    const last = confirmRef.current;
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async function confirmChoice() {
    const choice = pendingChoice;
    if (conflictReadFailed || !choice || inFlightIds.current.has(choice.conflictId)) return;
    inFlightIds.current.add(choice.conflictId);
    setInFlight((current) => new Set(current).add(choice.conflictId));
    setCardFeedback((current) => {
      const next = { ...current };
      delete next[choice.conflictId];
      return next;
    });

    try {
      const result = await resolveConflict(choice.conflictId, choice.choice, userId);
      const feedback = completedFeedback(result, text);
      setPendingChoice(null);
      if (feedback) {
        setResolutionFeedback(feedback);
      } else {
        setCardFeedback((current) => ({
          ...current,
          [choice.conflictId]: safeFailureMessage(result, text),
        }));
        returnFocusToTrigger();
      }
    } catch {
      setPendingChoice(null);
      setCardFeedback((current) => ({
        ...current,
        [choice.conflictId]: text.unexpected,
      }));
      returnFocusToTrigger();
    } finally {
      await refreshConflicts();
      await refreshBlockers();
      inFlightIds.current.delete(choice.conflictId);
      setInFlight((current) => {
        const next = new Set(current);
        next.delete(choice.conflictId);
        return next;
      });
    }
  }

  if (conflicts === null && !conflictReadFailed) return null;

  const confirmationText = pendingChoice
    ? pendingChoice.choice === "local"
      ? text.localConfirmText
      : pendingChoice.remoteDeleted
        ? text.remoteDeletedConfirmText
        : text.remoteConfirmText
    : "";

  const confirmationLabel = pendingChoice
    ? pendingChoice.choice === "local"
      ? text.localConfirm
      : pendingChoice.remoteDeleted
        ? text.remoteDeletedConfirm
        : text.remoteConfirm
    : "";

  const heading = conflicts && conflicts.length > 0
    ? text.conflictHeading(conflicts.length)
    : conflictReadFailed
      ? text.readFailed
      : text.noConflicts;

  const feedbackClass = resolutionFeedback?.tone === "success"
    ? "sync-conflict-live"
    : resolutionFeedback?.tone === "warning"
      ? "source-chip warning sync-conflict-result"
      : "settings-inline-status sync-conflict-result";

  return (
    <section
      id={SYNC_CONFLICTS_SECTION_ID}
      tabIndex={-1}
      className="settings-card sync-conflict-section"
      aria-labelledby="sync-conflicts-heading"
    >
      <div className="settings-card-head">
        <div>
          <p className="settings-card-eyebrow">{text.eyebrow}</p>
          <h3 id="sync-conflicts-heading">{heading}</h3>
          {!conflictReadFailed ? <p>{conflicts && conflicts.length > 0 ? text.paused : text.noConflictsBody}</p> : null}
          {!conflictReadFailed && conflicts?.length === 0 && onSyncNow ? (
            <button type="button" className="settings-secondary-action" disabled={syncingNow} onClick={() => void syncCleanState()}>
              {syncingNow ? text.processing : text.syncNow}
            </button>
          ) : null}
        </div>
      </div>

      {conflictReadFailed ? (
        <div className="settings-error sync-conflict-result" role="alert">
          <p>{text.readFailedBody}</p>
          <button
            type="button"
            className="settings-secondary-action"
            disabled={retryingRead}
            onClick={() => void retryConflictRead()}
          >
            {retryingRead ? text.retrying : text.retry}
          </button>
        </div>
      ) : null}

      {resolutionFeedback ? (
        <div
          className={feedbackClass}
          role={resolutionFeedback.tone === "warning" ? "alert" : "status"}
          aria-live={resolutionFeedback.tone === "warning" ? "assertive" : "polite"}
        >
          {resolutionFeedback.message}
        </div>
      ) : null}

      {conflicts && conflicts.length > 0 ? (
        <div className="sync-conflict-list">
          {conflicts.map((conflict) => {
            const busy = inFlight.has(conflict.id);
            const resolutionDisabled = conflictReadFailed || busy;
            return (
              <article key={conflict.id} className="sync-conflict-card" aria-label={text.conflictAria(conflict.entityLabel)}>
                <div className="sync-conflict-card-head">
                  <strong>{conflict.entityLabel}</strong>
                  {conflict.remoteDeleted ? (
                    <span className="sync-conflict-deleted">{text.serverDeleted}</span>
                  ) : null}
                </div>

                <dl className="sync-conflict-meta">
                  {conflict.detectedAt ? (
                    <div><dt>{text.detected}</dt><dd>{conflict.detectedAt}</dd></div>
                  ) : null}
                  {conflict.localUpdatedAt ? (
                    <div><dt>{text.deviceUpdated}</dt><dd>{conflict.localUpdatedAt}</dd></div>
                  ) : null}
                  {conflict.remoteUpdatedAt ? (
                    <div><dt>{text.serverUpdated}</dt><dd>{conflict.remoteUpdatedAt}</dd></div>
                  ) : null}
                </dl>

                {cardFeedback[conflict.id] ? (
                  <p className="settings-error sync-conflict-result" role="status" aria-live="assertive">
                    {cardFeedback[conflict.id]}
                  </p>
                ) : null}

                <div className="sync-conflict-actions">
                  <button
                    type="button"
                    className="settings-primary-action"
                    disabled={resolutionDisabled}
                    onClick={(event) => beginChoice(event, conflict, "local")}
                  >
                    {busy ? text.processing : text.keepLocal}
                  </button>
                  <button
                    type="button"
                    className="settings-secondary-action"
                    disabled={resolutionDisabled}
                    onClick={(event) => beginChoice(event, conflict, "remote")}
                  >
                    {text.useRemote}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}

      {pendingChoice ? (
        <div className="sync-conflict-dialog-backdrop">
          <div
            className="sync-conflict-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sync-conflict-dialog-title"
            aria-describedby="sync-conflict-dialog-description"
            onKeyDown={handleDialogKeyDown}
          >
            <p className="settings-card-eyebrow">{text.confirmEyebrow}</p>
            <h4 id="sync-conflict-dialog-title">{pendingChoice.entityLabel}</h4>
            <p id="sync-conflict-dialog-description">{confirmationText}</p>
            <div className="sync-conflict-dialog-actions">
              <button
                ref={cancelRef}
                type="button"
                className="settings-secondary-action"
                disabled={inFlight.has(pendingChoice.conflictId)}
                onClick={() => closeConfirmation()}
              >
                {text.back}
              </button>
              <button
                ref={confirmRef}
                type="button"
                className="settings-primary-action"
                disabled={inFlight.has(pendingChoice.conflictId)}
                onClick={() => void confirmChoice()}
              >
                {inFlight.has(pendingChoice.conflictId) ? text.processing : confirmationLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
