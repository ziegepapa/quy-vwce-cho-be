import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { listConflicts, resolveConflict } from "../lib/sync/engine";
import type { ConflictRecord, EntityTable, ResolveConflictResult } from "../lib/sync/types";

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
};

const ENTITY_LABEL: Record<EntityTable, string> = {
  settings: "Cài đặt",
  goals: "Mục tiêu",
  transactions: "Giao dịch",
  annualChecklists: "Checklist hằng năm",
  monthlySnapshots: "Tổng hợp tháng",
};

let focusTokenSequence = 0;

function newFocusToken(): string {
  focusTokenSequence += 1;
  return `${Date.now()}-${focusTokenSequence}`;
}

function validDateLabel(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

function toDisplayItem(conflict: ConflictRecord): ConflictDisplayItem {
  return {
    id: conflict.id,
    entityLabel: ENTITY_LABEL[conflict.table],
    detectedAt: validDateLabel(conflict.detectedAt),
    localUpdatedAt: validDateLabel(conflict.localUpdatedAt),
    remoteUpdatedAt: validDateLabel(conflict.remoteUpdatedAt),
    remoteDeleted: validDateLabel(conflict.remoteDeletedAt) !== null,
  };
}

function completedFeedback(result: ResolveConflictResult): ResolutionFeedback | null {
  if (result.status === "resolved-local") {
    return {
      tone: "success",
      message: "Đã giữ dữ liệu trên thiết bị và đồng bộ thành công.",
    };
  }
  if (result.status === "resolved-local-sync-pending") {
    return {
      tone: "pending",
      message:
        "Đã giữ dữ liệu trên thiết bị. Thay đổi đang chờ đồng bộ; dữ liệu server chưa bị ghi đè.",
    };
  }
  if (result.status === "resolved-local-pending-conflict") {
    return {
      tone: "warning",
      message:
        "Đã lưu lựa chọn trên thiết bị, nhưng trạng thái server đã thay đổi hoặc chưa thể cập nhật an toàn. Không có dữ liệu bị ghi đè. Vui lòng xem xung đột mới.",
    };
  }
  if (result.status === "remote-deleted") {
    return {
      tone: "success",
      message: "Đã áp dụng trạng thái bản trên server đã bị xóa.",
    };
  }
  if (result.status === "resolved-remote") {
    return {
      tone: "success",
      message: "Đã dùng bản dữ liệu hiện tại trên server.",
    };
  }
  return null;
}

function safeFailureMessage(result: ResolveConflictResult): string {
  return result.status === "needs-network-verification"
    ? "Chưa thể xác minh trạng thái server. Dữ liệu chưa bị thay đổi."
    : "Không thể áp dụng lựa chọn. Dữ liệu được giữ nguyên.";
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

export function conflictCtaLabel(count: number): string {
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
}: SyncConflictSectionProps) {
  const [conflicts, setConflicts] = useState<ConflictDisplayItem[] | null>(null);
  const [conflictReadFailed, setConflictReadFailed] = useState(false);
  const [retryingRead, setRetryingRead] = useState(false);
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
        setConflicts(unresolved.map(toDisplayItem));
        setConflictReadFailed(false);
      }
    } catch {
      if (mounted.current) setConflictReadFailed(true);
    }
  }, []);

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
      const feedback = completedFeedback(result);
      setPendingChoice(null);
      if (feedback) {
        setResolutionFeedback(feedback);
      } else {
        setCardFeedback((current) => ({
          ...current,
          [choice.conflictId]: safeFailureMessage(result),
        }));
        returnFocusToTrigger();
      }
    } catch {
      setPendingChoice(null);
      setCardFeedback((current) => ({
        ...current,
        [choice.conflictId]: "Không thể xử lý xung đột. Dữ liệu vẫn được giữ nguyên.",
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
  if (conflicts?.length === 0 && !conflictReadFailed && !resolutionFeedback) return null;

  const confirmationText = pendingChoice
    ? pendingChoice.choice === "local"
      ? "Bản trên thiết bị sẽ được giữ và gửi lại để đồng bộ."
      : pendingChoice.remoteDeleted
        ? "Bản trên server đang bị xóa. Nếu tiếp tục, trạng thái xóa trên server sẽ được áp dụng trên thiết bị này."
        : "Bản trên thiết bị sẽ bị thay bằng bản server hiện tại."
    : "";

  const confirmationLabel = pendingChoice
    ? pendingChoice.choice === "local"
      ? "Xác nhận giữ dữ liệu trên thiết bị này"
      : pendingChoice.remoteDeleted
        ? "Xác nhận áp dụng bản đã xóa"
        : "Xác nhận dùng dữ liệu đã đồng bộ"
    : "";

  const heading = conflicts && conflicts.length > 0
    ? `${conflicts.length} xung đột cần xử lý`
    : conflictReadFailed
      ? "Không thể đọc trạng thái xung đột"
      : "Trạng thái xử lý xung đột";

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
          <p className="settings-card-eyebrow">Đồng bộ cần quyết định</p>
          <h3 id="sync-conflicts-heading">{heading}</h3>
          {conflicts && conflicts.length > 0 ? (
            <p>
              Đồng bộ đã dừng để tránh ghi đè hoặc làm mất dữ liệu. Hãy chọn rõ bản dữ liệu cần giữ
              cho từng mục.
            </p>
          ) : null}
        </div>
      </div>

      {conflictReadFailed ? (
        <div className="settings-error sync-conflict-result" role="alert">
          <p>Không thể đọc trạng thái xung đột. Dữ liệu chưa bị thay đổi.</p>
          <button
            type="button"
            className="settings-secondary-action"
            disabled={retryingRead}
            onClick={() => void retryConflictRead()}
          >
            {retryingRead ? "Đang tải lại…" : "Thử tải lại"}
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
              <article key={conflict.id} className="sync-conflict-card" aria-label={`Xung đột ${conflict.entityLabel}`}>
                <div className="sync-conflict-card-head">
                  <strong>{conflict.entityLabel}</strong>
                  {conflict.remoteDeleted ? (
                    <span className="sync-conflict-deleted">Bản trên server đã bị xóa</span>
                  ) : null}
                </div>

                <dl className="sync-conflict-meta">
                  {conflict.detectedAt ? (
                    <div><dt>Phát hiện</dt><dd>{conflict.detectedAt}</dd></div>
                  ) : null}
                  {conflict.localUpdatedAt ? (
                    <div><dt>Thiết bị cập nhật</dt><dd>{conflict.localUpdatedAt}</dd></div>
                  ) : null}
                  {conflict.remoteUpdatedAt ? (
                    <div><dt>Server cập nhật</dt><dd>{conflict.remoteUpdatedAt}</dd></div>
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
                    {busy ? "Đang xử lý…" : "Giữ dữ liệu trên thiết bị này"}
                  </button>
                  <button
                    type="button"
                    className="settings-secondary-action"
                    disabled={resolutionDisabled}
                    onClick={(event) => beginChoice(event, conflict, "remote")}
                  >
                    Dùng dữ liệu đã đồng bộ
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
            <p className="settings-card-eyebrow">Xác nhận lựa chọn</p>
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
                Quay lại, chưa thay đổi
              </button>
              <button
                ref={confirmRef}
                type="button"
                className="settings-primary-action"
                disabled={inFlight.has(pendingChoice.conflictId)}
                onClick={() => void confirmChoice()}
              >
                {inFlight.has(pendingChoice.conflictId) ? "Đang xử lý…" : confirmationLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
