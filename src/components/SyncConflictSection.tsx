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

const SUCCESS_STATUS = new Set<ResolveConflictResult["status"]>([
  "resolved-local",
  "resolved-remote",
  "remote-deleted",
]);

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

function successMessage(status: ResolveConflictResult["status"]): string {
  if (status === "resolved-local") {
    return "Đã giữ dữ liệu trên thiết bị này và đưa lại vào hàng đợi đồng bộ.";
  }
  if (status === "remote-deleted") {
    return "Đã áp dụng trạng thái bản trên server đã bị xóa.";
  }
  return "Đã dùng bản dữ liệu hiện tại trên server.";
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
  const [pendingChoice, setPendingChoice] = useState<PendingChoice | null>(null);
  const [inFlight, setInFlight] = useState<Set<string>>(() => new Set());
  const [cardFeedback, setCardFeedback] = useState<Record<string, string>>({});
  const [successFeedback, setSuccessFeedback] = useState<string | null>(null);
  const mounted = useRef(true);
  const handledFocusRequest = useRef<string | null>(null);
  const inFlightIds = useRef(new Set<string>());
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const confirmRef = useRef<HTMLButtonElement | null>(null);

  const refreshConflicts = useCallback(async () => {
    try {
      const unresolved = await listConflicts();
      if (mounted.current) setConflicts(unresolved.map(toDisplayItem));
    } catch {
      if (mounted.current) setConflicts([]);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refreshConflicts();
    return () => {
      mounted.current = false;
    };
  }, [refreshConflicts]);

  useEffect(() => {
    if (!focusRequest || conflicts === null || handledFocusRequest.current === focusRequest) return;
    handledFocusRequest.current = focusRequest;
    if (conflicts.length > 0) void focusSyncConflictSection();
  }, [conflicts, focusRequest]);

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
    if (inFlightIds.current.has(conflict.id)) return;
    triggerRef.current = event.currentTarget;
    setSuccessFeedback(null);
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
    if (!choice || inFlightIds.current.has(choice.conflictId)) return;
    inFlightIds.current.add(choice.conflictId);
    setInFlight((current) => new Set(current).add(choice.conflictId));
    setCardFeedback((current) => {
      const next = { ...current };
      delete next[choice.conflictId];
      return next;
    });

    try {
      const result = await resolveConflict(choice.conflictId, choice.choice, userId);
      if (SUCCESS_STATUS.has(result.status)) {
        setSuccessFeedback(successMessage(result.status));
        setPendingChoice(null);
        await refreshConflicts();
        try {
          await onResolved();
        } catch {
          // The resolution remains authoritative; the next app refresh will reload counts.
        }
        return;
      }

      setPendingChoice(null);
      setCardFeedback((current) => ({ ...current, [choice.conflictId]: result.reason }));
      returnFocusToTrigger();
    } catch {
      setPendingChoice(null);
      setCardFeedback((current) => ({
        ...current,
        [choice.conflictId]: "Không thể xử lý xung đột. Dữ liệu vẫn được giữ nguyên.",
      }));
      returnFocusToTrigger();
    } finally {
      inFlightIds.current.delete(choice.conflictId);
      setInFlight((current) => {
        const next = new Set(current);
        next.delete(choice.conflictId);
        return next;
      });
    }
  }

  if (conflicts === null || conflicts.length === 0) return null;

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
          <h3 id="sync-conflicts-heading">{conflicts.length} xung đột cần xử lý</h3>
          <p>
            Đồng bộ đã dừng để tránh ghi đè hoặc làm mất dữ liệu. Hãy chọn rõ bản dữ liệu cần giữ
            cho từng mục.
          </p>
        </div>
      </div>

      <div className="sync-conflict-live" role="status" aria-live="polite">
        {successFeedback}
      </div>

      <div className="sync-conflict-list">
        {conflicts.map((conflict) => {
          const busy = inFlight.has(conflict.id);
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
                  disabled={busy}
                  onClick={(event) => beginChoice(event, conflict, "local")}
                >
                  {busy ? "Đang xử lý…" : "Giữ dữ liệu trên thiết bị này"}
                </button>
                <button
                  type="button"
                  className="settings-secondary-action"
                  disabled={busy}
                  onClick={(event) => beginChoice(event, conflict, "remote")}
                >
                  Dùng dữ liệu đã đồng bộ
                </button>
              </div>
            </article>
          );
        })}
      </div>

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
