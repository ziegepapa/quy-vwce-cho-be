import { useEffect, useState } from "react";
import SyncConflictSection from "../components/SyncConflictSection";
import { countLocalData, db, exportBackup } from "../lib/db";
import { uid } from "../lib/defaults";
import {
  getSyncMeta,
  processRecoverySession,
  saveSyncMeta,
} from "../lib/sync/engine";
import { enqueueRecoveryItem } from "../lib/sync/outbox";
import type { EntityTable, RecoveryState } from "../lib/sync/types";

type Props = {
  userId: string;
  onDone: () => void | Promise<void>;
  onBack: () => void;
};
type Counts = {
  settings: number;
  goals: number;
  transactions: number;
  annualChecklists: number;
  monthlySnapshots: number;
};
type Phase =
  | "review"
  | "confirm"
  | "queued"
  | "conflict"
  | "unverified"
  | "complete"
  | "account-check"
  | "prepare-failed";
type RecoverableRow = { id: string; version?: unknown; [key: string]: unknown };

const EMPTY_COUNTS: Counts = { settings: 0, goals: 0, transactions: 0, annualChecklists: 0, monthlySnapshots: 0 };
const BACKUP_FAILURE_MESSAGE = "Chưa tạo được bản sao lưu. Dữ liệu trên thiết bị vẫn được giữ nguyên.";
const RECOVERY_FAILURE_MESSAGE = "Chưa thể chuẩn bị dữ liệu để khôi phục. Dữ liệu trên thiết bị vẫn được giữ nguyên.";
const QUEUED_COPY = "Dữ liệu trên iPhone vẫn được giữ nguyên và đã sẵn sàng để khôi phục. Ứng dụng chưa xác nhận dữ liệu trong tài khoản, nên bạn chưa thể hoàn tất hoặc đăng xuất.";
const CONFLICT_COPY = "Dữ liệu trên iPhone và dữ liệu trong tài khoản khác nhau. Ứng dụng chưa ghi đè dữ liệu nào. Hãy kiểm tra và chọn phiên bản bạn muốn giữ.";
const UNVERIFIED_COPY = "Dữ liệu trên iPhone vẫn được giữ nguyên. Hãy kết nối mạng và thử kiểm tra lại. Bạn chưa thể hoàn tất hoặc đăng xuất.";

// Ordinary-outbox collision: a prior pending edit for the same entity blocks
// recovery. We surface a safe, explicit account-check state instead of the
// generic preparation failure. We never touch the existing ordinary item.
const ACCOUNT_CHECK_TITLE = "Cần kiểm tra dữ liệu trong tài khoản";
const ACCOUNT_CHECK_BODY_LINE_1 = "Ứng dụng phát hiện thay đổi trước đó đang chờ được xác minh.";
const ACCOUNT_CHECK_BODY_LINE_2 = "Dữ liệu trên iPhone vẫn được giữ nguyên và chưa có dữ liệu nào bị ghi đè.";
const ACCOUNT_CHECK_PRIMARY = "Kiểm tra dữ liệu trong tài khoản";
const ACCOUNT_CHECK_RETRY_MESSAGE = "Chưa thể kiểm tra dữ liệu trong tài khoản lúc này. Dữ liệu trên iPhone vẫn được giữ nguyên. Hãy thử lại.";
const BACK_LABEL = "Quay lại — chưa khôi phục dữ liệu";
const PREPARE_RETRY_LABEL = "Thử chuẩn bị lại";
// enqueueRecoveryItem throws exactly this when a prior ordinary outbox item
// exists for the same entity. Matching on it lets us keep every other failure
// on the generic safe fallback.
const RECOVERY_QUEUE_BLOCKED_MESSAGE = "Recovery queue blocked";

function isRecoveryQueueBlocked(error: unknown): boolean {
  return error instanceof Error && error.message === RECOVERY_QUEUE_BLOCKED_MESSAGE;
}

function sourceVersion(row: RecoverableRow): number | null {
  return typeof row.version === "number" && Number.isFinite(row.version)
    ? Math.max(0, Math.trunc(row.version))
    : null;
}
function phaseForState(state?: RecoveryState): Phase {
  if (state === "complete") return "complete";
  if (state === "conflict") return "conflict";
  if (state === "queued" || state === "verifying") return "queued";
  return "review";
}

export default function MigrateWizard({ userId, onDone, onBack }: Props) {
  const [counts, setCounts] = useState<Counts>(EMPTY_COUNTS);
  const [phase, setPhase] = useState<Phase>("review");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [backupFailed, setBackupFailed] = useState(false);
  const [showConflicts, setShowConflicts] = useState(false);

  useEffect(() => {
    void Promise.all([countLocalData(), getSyncMeta(userId)])
      .then(([nextCounts, meta]) => {
        setCounts(nextCounts);
        setSessionId(meta.recoverySessionId ?? null);
        setPhase(meta.migrateWizardDone && meta.recoveryState === "complete" ? "complete" : phaseForState(meta.recoveryState));
      })
      .catch(() => {
        setPhase("unverified");
        setMessage(UNVERIFIED_COPY);
      });
  }, [userId]);

  const total = counts.settings + counts.goals + counts.transactions + counts.annualChecklists + counts.monthlySnapshots;

  async function initiateBackupDownload(): Promise<void> {
    if (typeof document === "undefined" || typeof Blob === "undefined" || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
      throw new Error("Backup unavailable");
    }
    const payload = await exportBackup();
    const objectUrl = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = "ban-sao-luu-truoc-khi-khoi-phuc.json";
    anchor.setAttribute("aria-label", "Bản sao lưu trước khi khôi phục");
    anchor.click();
    // The backup handoff is considered successfully initiated once anchor.click()
    // returns. On iPhone Safari the native download prompt can overlay or navigate
    // the page, and revoking the object URL synchronously here can cancel the
    // download or throw. Revoking is best-effort cleanup only: it must never turn a
    // successful handoff into a failure or block the transition to confirmation.
    if (typeof URL.revokeObjectURL === "function") {
      try {
        URL.revokeObjectURL(objectUrl);
      } catch {
        /* best-effort cleanup only */
      }
    }
  }

  async function beginRestore() {
    if (busy || total === 0) return;
    setBusy(true); setMessage(""); setBackupFailed(false);
    try {
      await initiateBackupDownload();
      setPhase("confirm");
    } catch {
      setBackupFailed(true); setMessage(BACKUP_FAILURE_MESSAGE); setPhase("review");
    } finally { setBusy(false); }
  }

  async function queueRows(table: EntityTable, rows: RecoverableRow[], recoverySessionId: string) {
    for (const row of rows) {
      await enqueueRecoveryItem({
        recoverySessionId,
        table,
        entityId: row.id,
        payload: row,
        sourceLocalVersion: sourceVersion(row),
      });
    }
  }

  // Shared preparation path for the explicit confirmation and for the
  // "Thử chuẩn bị lại" retry. Everything runs inside one transaction, so any
  // failure rolls back completely: no recover items are created and every
  // existing ordinary outbox item and local row is preserved.
  async function prepareRecovery() {
    setBusy(true); setMessage("");
    try {
      const meta = await getSyncMeta(userId);
      const recoverySessionId = meta.recoverySessionId && meta.recoveryState !== "complete"
        ? meta.recoverySessionId
        : uid("recovery-session");
      await db.transaction(
        "rw",
        [db.settings, db.goals, db.transactions, db.annualChecklists, db.monthlySnapshots, db.outbox, db.syncMeta],
        async () => {
          const [settings, goals, transactions, checklists, snapshots] = await Promise.all([
            db.settings.toArray(), db.goals.toArray(), db.transactions.toArray(),
            db.annualChecklists.toArray(), db.monthlySnapshots.toArray(),
          ]);
          await queueRows("settings", settings as RecoverableRow[], recoverySessionId);
          await queueRows("goals", goals as RecoverableRow[], recoverySessionId);
          await queueRows("transactions", transactions as RecoverableRow[], recoverySessionId);
          await queueRows("annualChecklists", checklists as RecoverableRow[], recoverySessionId);
          await queueRows("monthlySnapshots", snapshots as RecoverableRow[], recoverySessionId);
          await saveSyncMeta({
            userId,
            recoverySessionId,
            recoveryState: "queued",
            recoveryTotal: settings.length + goals.length + transactions.length + checklists.length + snapshots.length,
            recoveryConfirmed: 0,
            migrateWizardDone: false,
            migrateWizardSkipped: false,
          });
        },
      );
      setSessionId(recoverySessionId);
      setPhase("queued");
    } catch (error) {
      if (isRecoveryQueueBlocked(error)) {
        // A prior ordinary outbox item (e.g. a pending settings edit) blocks
        // recovery. Nothing was written; offer a safe, explicit account check.
        setPhase("account-check");
      } else {
        setMessage(RECOVERY_FAILURE_MESSAGE);
        setPhase("prepare-failed");
      }
    } finally { setBusy(false); }
  }

  async function confirmRestore() {
    if (busy || total === 0 || phase !== "confirm") return;
    await prepareRecovery();
  }

  async function retryPrepare() {
    if (busy || total === 0 || phase !== "prepare-failed") return;
    await prepareRecovery();
  }

  // Safe account check for the ordinary-outbox collision. It never enqueues,
  // upserts, deletes or merges anything; it only verifies via the existing
  // read-first recovery path and maps the outcome. Completion/gate release can
  // only happen once the account is verified.
  async function checkAccountData() {
    if (busy || phase !== "account-check") return;
    setBusy(true); setMessage("");
    try {
      const meta = await getSyncMeta(userId);
      const verifiableSession = meta.recoverySessionId && meta.recoveryState !== "complete"
        ? meta.recoverySessionId
        : sessionId;
      if (!verifiableSession) {
        // No recovery session to verify safely (session/server unavailable).
        // Retry only — stay on the account-check state.
        setMessage(ACCOUNT_CHECK_RETRY_MESSAGE);
        return;
      }
      const result = await processRecoverySession(userId, verifiableSession);
      if (result.status === "confirmed") {
        const [nextCounts, confirmedMeta] = await Promise.all([countLocalData(), getSyncMeta(userId)]);
        if (!confirmedMeta.migrateWizardDone || confirmedMeta.recoveryState !== "complete") {
          setSessionId(verifiableSession);
          setPhase("unverified");
          return;
        }
        setSessionId(verifiableSession);
        setCounts(nextCounts);
        setPhase("complete");
      } else if (result.status === "conflict") {
        setSessionId(verifiableSession);
        setPhase("conflict");
      } else {
        setSessionId(verifiableSession);
        setPhase("unverified");
      }
    } catch {
      setPhase("unverified");
    } finally { setBusy(false); }
  }

  async function verifyWithAccount() {
    if (busy || !sessionId || (phase !== "queued" && phase !== "unverified")) return;
    setBusy(true); setMessage("");
    try {
      const result = await processRecoverySession(userId, sessionId);
      if (result.status === "confirmed") {
        const [nextCounts, meta] = await Promise.all([countLocalData(), getSyncMeta(userId)]);
        if (!meta.migrateWizardDone || meta.recoveryState !== "complete") throw new Error("Recovery incomplete");
        setCounts(nextCounts);
        setPhase("complete");
      } else if (result.status === "conflict") {
        setPhase("conflict");
      } else if (result.status === "unverified") {
        setPhase("unverified");
      } else {
        setPhase("queued");
      }
    } catch {
      setPhase("unverified");
    } finally { setBusy(false); }
  }

  async function refreshAfterConflict() {
    try {
      const meta = await getSyncMeta(userId);
      if (meta.migrateWizardDone && meta.recoveryState === "complete") {
        setCounts(await countLocalData());
        setShowConflicts(false);
        setPhase("complete");
      } else if (meta.recoveryState === "conflict") setPhase("conflict");
      else setPhase("queued");
    } catch { setPhase("unverified"); }
  }

  async function finishRecovery() {
    if (busy || phase !== "complete") return;
    setBusy(true); setMessage("");
    try { await onDone(); }
    catch { setMessage("Chưa thể mở Cài đặt → Dữ liệu. Dữ liệu trên thiết bị vẫn được giữ nguyên."); }
    finally { setBusy(false); }
  }

  function handleBack() {
    setPhase("review");
    setMessage("Dữ liệu trên thiết bị vẫn được giữ nguyên và sẽ chờ bạn khôi phục.");
    onBack();
  }

  const heading = phase === "complete" ? "Đã khôi phục dữ liệu"
    : phase === "conflict" ? "Cần chọn phiên bản dữ liệu"
      : phase === "unverified" ? "Chưa thể kiểm tra dữ liệu trong tài khoản"
        : phase === "queued" ? "Dữ liệu đang chờ được kiểm tra"
          : phase === "account-check" ? ACCOUNT_CHECK_TITLE
            : "Khôi phục dữ liệu trên thiết bị";
  const copy = phase === "complete"
    ? "Dữ liệu trên thiết bị đã được đưa vào tài khoản. Hãy kiểm tra Cài đặt → Dữ liệu trước khi đăng xuất."
    : phase === "conflict" ? CONFLICT_COPY
      : phase === "unverified" ? UNVERIFIED_COPY
        : phase === "queued" ? QUEUED_COPY
          : "Đã tìm thấy dữ liệu cũ trên iPhone này. Khôi phục để dùng lại với tài khoản của bạn.";

  return (
    <div className="app-shell">
      <div className="card">
        <h1 className="page-title">{heading}</h1>
        {phase === "account-check" ? (
          <p className="muted">
            {ACCOUNT_CHECK_BODY_LINE_1}<br />{ACCOUNT_CHECK_BODY_LINE_2}
          </p>
        ) : (
          <p className="muted">{copy}</p>
        )}
        {(phase === "review" || phase === "confirm") ? (
          <p className="muted">Để an toàn, ứng dụng sẽ tạo một bản sao lưu trên iPhone trước khi khôi phục. Safari có thể hỏi nơi lưu file. Hãy chọn ‘Tải về’.</p>
        ) : null}

        <table aria-label="Tóm tắt dữ liệu trên thiết bị" style={{ width: "100%", fontSize: ".9rem" }}>
          <tbody>
            <tr><td>Cài đặt</td><td>{counts.settings}</td></tr>
            <tr><td>Mục tiêu</td><td>{counts.goals}</td></tr>
            <tr><td>Giao dịch</td><td>{counts.transactions}</td></tr>
            <tr><td>Checklist</td><td>{counts.annualChecklists}</td></tr>
            <tr><td>Snapshots</td><td>{counts.monthlySnapshots}</td></tr>
          </tbody>
        </table>

        {message ? <div className="banner error" role="alert">{message}</div> : null}
        <div className="stack">
          {phase === "review" ? (
            <>
              <button type="button" disabled={busy || total === 0} onClick={() => void beginRestore()}>
                {busy ? "Đang tạo bản sao lưu…" : backupFailed ? "Thử tạo bản sao lưu lại" : "Khôi phục dữ liệu trên thiết bị"}
              </button>
              <button type="button" className="secondary" disabled={busy} onClick={handleBack}>{BACK_LABEL}</button>
            </>
          ) : null}
          {phase === "account-check" ? (
            <>
              <button type="button" disabled={busy} onClick={() => void checkAccountData()}>{busy ? "Đang kiểm tra…" : ACCOUNT_CHECK_PRIMARY}</button>
              <button type="button" className="secondary" disabled={busy} onClick={handleBack}>{BACK_LABEL}</button>
            </>
          ) : null}
          {phase === "prepare-failed" ? (
            <>
              <button type="button" disabled={busy || total === 0} onClick={() => void retryPrepare()}>{busy ? "Đang chuẩn bị…" : PREPARE_RETRY_LABEL}</button>
              <button type="button" className="secondary" disabled={busy} onClick={handleBack}>{BACK_LABEL}</button>
            </>
          ) : null}
          {phase === "queued" ? (
            <button type="button" disabled={busy} onClick={() => void verifyWithAccount()}>{busy ? "Đang kiểm tra…" : "Kiểm tra dữ liệu trong tài khoản"}</button>
          ) : null}
          {phase === "unverified" ? (
            <button type="button" disabled={busy} onClick={() => void verifyWithAccount()}>{busy ? "Đang kiểm tra…" : "Thử kiểm tra lại"}</button>
          ) : null}
          {phase === "conflict" ? (
            <button type="button" disabled={busy} onClick={() => setShowConflicts(true)}>Xem xung đột</button>
          ) : null}
          {phase === "complete" ? (
            <button type="button" disabled={busy} onClick={() => void finishRecovery()}>{busy ? "Đang mở dữ liệu…" : "Kiểm tra dữ liệu"}</button>
          ) : null}
        </div>
      </div>

      {showConflicts && phase === "conflict" ? (
        <SyncConflictSection userId={userId} onResolved={refreshAfterConflict} />
      ) : null}

      {phase === "confirm" ? (
        <div className="modal-backdrop" role="presentation">
          <div className="card modal-card" role="dialog" aria-modal="true" aria-labelledby="recovery-confirm-title">
            <h2 id="recovery-confirm-title">Khôi phục dữ liệu vào tài khoản?</h2>
            <p>Dữ liệu tìm thấy trên iPhone sẽ được đưa vào tài khoản này. Nếu bản trên server khác, ứng dụng sẽ dừng để hỏi bạn; không tự ghi đè dữ liệu.</p>
            <div className="stack">
              <button type="button" className="secondary" disabled={busy} onClick={() => { setPhase("review"); setMessage(""); }}>Quay lại</button>
              <button type="button" disabled={busy} onClick={() => void confirmRestore()}>{busy ? "Đang chuẩn bị…" : "Xác nhận khôi phục dữ liệu"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
