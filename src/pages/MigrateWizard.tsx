import { useEffect, useState } from "react";
import SyncConflictSection from "../components/SyncConflictSection";
import { useLocale } from "../lib/locale";
import { countLocalData, db, exportBackup } from "../lib/db";
import { uid } from "../lib/defaults";
import {
  fetchCurrentRemote,
  getSyncMeta,
  processRecoverySession,
  saveSyncMeta,
} from "../lib/sync/engine";
import { enqueueRecoveryItem } from "../lib/sync/outbox";
import type { EntityTable, OutboxItem, RecoveryState } from "../lib/sync/types";

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
  | "account-verified"
  | "prepare-failed";
type RecoverableRow = { id: string; version?: unknown; [key: string]: unknown };
type AccountCheckOutcome = "exact" | "conflict" | "retry";

const EMPTY_COUNTS: Counts = { settings: 0, goals: 0, transactions: 0, annualChecklists: 0, monthlySnapshots: 0 };
const BACKUP_FAILURE_MESSAGE = "Chưa tạo được bản sao lưu. Dữ liệu trên thiết bị vẫn được giữ nguyên.";
const RECOVERY_FAILURE_MESSAGE = "Chưa thể chuẩn bị dữ liệu để khôi phục. Dữ liệu trên thiết bị vẫn được giữ nguyên.";
const QUEUED_COPY = "Dữ liệu trên iPhone vẫn được giữ nguyên và đã sẵn sàng để khôi phục. Ứng dụng chưa xác nhận dữ liệu trong tài khoản, nên bạn chưa thể hoàn tất hoặc đăng xuất.";
const CONFLICT_COPY = "Dữ liệu trên iPhone và dữ liệu trong tài khoản khác nhau. Ứng dụng chưa ghi đè dữ liệu nào. Hãy kiểm tra và chọn phiên bản bạn muốn giữ.";
const UNVERIFIED_COPY = "Dữ liệu trên iPhone vẫn được giữ nguyên. Hãy kết nối mạng và thử kiểm tra lại. Bạn chưa thể hoàn tất hoặc đăng xuất.";

// Ordinary-outbox collision: a prior pending edit for the same entity blocks
// recovery. The confirmRestore transaction rolls back, so NO recovery session
// and NO recover items are created. We surface a safe, explicit account-check
// state instead of the generic preparation failure, and never touch the
// existing ordinary item.
const ACCOUNT_CHECK_TITLE = "Cần kiểm tra dữ liệu trong tài khoản";
const ACCOUNT_CHECK_BODY_LINE_1 = "Ứng dụng phát hiện thay đổi trước đó đang chờ được xác minh.";
const ACCOUNT_CHECK_BODY_LINE_2 = "Dữ liệu trên iPhone vẫn được giữ nguyên và chưa có dữ liệu nào bị ghi đè.";
const ACCOUNT_CHECK_PRIMARY = "Kiểm tra dữ liệu trong tài khoản";
const ACCOUNT_CHECK_RETRY_MESSAGE = "Chưa thể kiểm tra dữ liệu trong tài khoản lúc này. Dữ liệu trên iPhone vẫn được giữ nguyên. Hãy thử lại.";
// Safe verified no-op: the pending change already matches the account. We do
// NOT release the recovery gate or mark recovery complete here.
const ACCOUNT_VERIFIED_TITLE = "Dữ liệu đã khớp với tài khoản";
const ACCOUNT_VERIFIED_COPY = "Thay đổi đang chờ trên iPhone đã khớp với dữ liệu trong tài khoản. Không có dữ liệu nào bị ghi đè và bạn không cần khôi phục thêm.";
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

// Pure, read-only comparison helpers. They mirror the engine's recovery
// comparison (ignore version and deletion markers, canonicalise key order) so
// the wizard can decide exact-vs-divergent without importing engine internals
// or mutating anything.
function canonicalJson(value: unknown): string {
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(normalize);
    if (!input || typeof input !== "object") return input;
    return Object.fromEntries(
      Object.entries(input as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, val]) => [key, normalize(val)]),
    );
  };
  return JSON.stringify(normalize(value));
}
function comparableEntityData(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const next = { ...(value as Record<string, unknown>) };
  delete next.version;
  delete next.deletedAt;
  delete next.deleted_at;
  return next;
}
function sameEntityData(a: unknown, b: unknown): boolean {
  const left = comparableEntityData(a);
  const right = comparableEntityData(b);
  return Boolean(left && right && canonicalJson(left) === canonicalJson(right));
}

// Read-only verification of a single pending ORDINARY outbox item against the
// current remote state. It NEVER enqueues, upserts, deletes, resolves, or
// releases the gate — it only fetches and compares.
async function verifyOrdinaryItemAgainstRemote(
  userId: string,
  item: OutboxItem,
): Promise<AccountCheckOutcome> {
  const remote = await fetchCurrentRemote(userId, item.table, item.entityId);
  if (remote.state === "unavailable") return "retry";
  if (item.op === "delete") {
    // Pending deletion: if the account no longer has the row the intent is
    // already satisfied (safe no-op); still present -> the user must choose.
    return remote.state === "present" ? "conflict" : "exact";
  }
  if (remote.state === "present") {
    return sameEntityData(remote.data, item.payload) ? "exact" : "conflict";
  }
  if (remote.state === "deleted") return "conflict"; // tombstone
  // not-found for a pending upsert: the account does not have this row yet. We
  // must not insert it here and cannot claim a verified no-op, so offer retry.
  return "retry";
}

export default function MigrateWizard({ userId, onDone, onBack }: Props) {
  const { locale } = useLocale();
  const copy = (vi: string, de: string) => (locale === "de" ? de : vi);
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
        setMessage(copy(UNVERIFIED_COPY, "Die Daten auf dem iPhone bleiben erhalten. Stellen Sie eine Internetverbindung her und prüfen Sie erneut. Sie können noch nicht fortfahren oder sich abmelden."));
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
    anchor.download = locale === "de" ? "sicherung-vor-wiederherstellung.json" : "ban-sao-luu-truoc-khi-khoi-phuc.json";
    anchor.setAttribute("aria-label", copy("Bản sao lưu trước khi khôi phục", "Sicherung vor der Wiederherstellung"));
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
      setBackupFailed(true); setMessage(copy(BACKUP_FAILURE_MESSAGE, "Die Sicherung konnte nicht erstellt werden. Die Daten auf diesem Gerät bleiben unverändert.")); setPhase("review");
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
  // existing ordinary outbox item and local row is preserved. On an
  // ordinary-outbox collision, saveSyncMeta never runs, so no recovery session
  // is created.
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
        // recovery. Nothing was written and no session exists; offer a safe,
        // explicit account check backed by real read-only verification.
        setPhase("account-check");
      } else {
        setMessage(copy(RECOVERY_FAILURE_MESSAGE, "Die Daten für die Wiederherstellung konnten nicht vorbereitet werden. Die Daten auf diesem Gerät bleiben unverändert."));
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

  // Safe account check for the ordinary-outbox collision. There is NO recovery
  // session in this path, so we never call processRecoverySession. Instead we
  // read the pending ordinary outbox items and verify each one read-only against
  // the current remote state. We never enqueue, upsert, delete/replace the
  // ordinary item, sync, resolve, or release the gate.
  async function checkAccountData() {
    if (busy || phase !== "account-check") return;
    setBusy(true); setMessage("");
    try {
      const pending = (await db.outbox.toArray()) as OutboxItem[];
      const ordinary = pending.filter((item) => item.op === "upsert" || item.op === "delete");
      if (ordinary.length === 0) {
        // Nothing to verify safely; stay on account-check and offer retry only.
        setMessage(copy(ACCOUNT_CHECK_RETRY_MESSAGE, "Die Daten im Konto können momentan nicht geprüft werden. Die Daten auf dem iPhone bleiben unverändert. Bitte versuchen Sie es erneut."));
        return;
      }
      let sawConflict = false;
      let sawRetry = false;
      let sawExact = false;
      for (const item of ordinary) {
        const outcome = await verifyOrdinaryItemAgainstRemote(userId, item);
        if (outcome === "conflict") sawConflict = true;
        else if (outcome === "retry") sawRetry = true;
        else sawExact = true;
      }
      // Precedence: a confirmed divergence must be surfaced; otherwise if we
      // could not verify everything, retry; only claim a safe no-op when every
      // pending item was verified as an exact match.
      if (sawConflict) { setPhase("conflict"); return; }
      if (sawRetry) { setMessage(copy(ACCOUNT_CHECK_RETRY_MESSAGE, "Die Daten im Konto können momentan nicht geprüft werden. Die Daten auf dem iPhone bleiben unverändert. Bitte versuchen Sie es erneut.")); return; }
      if (sawExact) { setPhase("account-verified"); return; }
      setMessage(copy(ACCOUNT_CHECK_RETRY_MESSAGE, "Die Daten im Konto können momentan nicht geprüft werden. Die Daten auf dem iPhone bleiben unverändert. Bitte versuchen Sie es erneut."));
    } catch {
      // Unavailable/offline/auth/RLS: keep everything intact and offer retry.
      setMessage(copy(ACCOUNT_CHECK_RETRY_MESSAGE, "Die Daten im Konto können momentan nicht geprüft werden. Die Daten auf dem iPhone bleiben unverändert. Bitte versuchen Sie es erneut."));
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
    catch { setMessage(copy("Chưa thể mở Cài đặt → Dữ liệu. Dữ liệu trên thiết bị vẫn được giữ nguyên.", "Einstellungen → Daten konnten nicht geöffnet werden. Die Daten auf diesem Gerät bleiben unverändert.")); }
    finally { setBusy(false); }
  }

  function handleBack() {
    setPhase("review");
    setMessage(copy("Dữ liệu trên thiết bị vẫn được giữ nguyên và sẽ chờ bạn khôi phục.", "Die Daten auf diesem Gerät bleiben erhalten und warten auf Ihre Wiederherstellung."));
    onBack();
  }

  const heading = phase === "complete" ? copy("Đã khôi phục dữ liệu", "Daten wurden wiederhergestellt")
    : phase === "conflict" ? copy("Cần chọn phiên bản dữ liệu", "Eine Datenversion muss ausgewählt werden")
      : phase === "unverified" ? copy("Chưa thể kiểm tra dữ liệu trong tài khoản", "Die Daten im Konto können noch nicht geprüft werden")
        : phase === "queued" ? copy("Dữ liệu đang chờ được kiểm tra", "Daten warten auf die Prüfung")
          : phase === "account-check" ? copy(ACCOUNT_CHECK_TITLE, "Kontodaten müssen geprüft werden")
            : phase === "account-verified" ? copy(ACCOUNT_VERIFIED_TITLE, "Daten stimmen mit dem Konto überein")
              : copy("Khôi phục dữ liệu trên thiết bị", "Daten auf diesem Gerät wiederherstellen");
  const bodyCopy = phase === "complete"
    ? copy("Dữ liệu trên thiết bị đã được đưa vào tài khoản. Hãy kiểm tra Cài đặt → Dữ liệu trước khi đăng xuất.", "Die Daten auf diesem Gerät wurden in Ihr Konto übernommen. Prüfen Sie Einstellungen → Daten, bevor Sie sich abmelden.")
    : phase === "conflict" ? copy(CONFLICT_COPY, "Die Daten auf dem iPhone und im Konto unterscheiden sich. Die App hat nichts überschrieben. Prüfen Sie beide Versionen und wählen Sie, welche Sie behalten möchten.")
      : phase === "unverified" ? copy(UNVERIFIED_COPY, "Die Daten auf dem iPhone bleiben erhalten. Stellen Sie eine Internetverbindung her und prüfen Sie erneut. Sie können noch nicht fortfahren oder sich abmelden.")
        : phase === "queued" ? copy(QUEUED_COPY, "Die Daten auf dem iPhone bleiben erhalten und sind für die Wiederherstellung bereit. Die App hat die Daten im Konto noch nicht bestätigt; Sie können noch nicht fortfahren oder sich abmelden.")
          : phase === "account-verified" ? copy(ACCOUNT_VERIFIED_COPY, "Die ausstehende Änderung auf dem iPhone stimmt bereits mit den Kontodaten überein. Es wurde nichts überschrieben und keine weitere Wiederherstellung ist nötig.")
            : copy("Đã tìm thấy dữ liệu cũ trên iPhone này. Khôi phục để dùng lại với tài khoản của bạn.", "Auf diesem iPhone wurden vorhandene Daten gefunden. Stellen Sie sie wieder her, um sie mit Ihrem Konto weiterzuverwenden.");

  return (
    <div className="app-shell">
      <div className="card">
        <h1 className="page-title">{heading}</h1>
        {phase === "account-check" ? (
          <p className="muted">
            {copy(ACCOUNT_CHECK_BODY_LINE_1, "Die App hat eine frühere Änderung erkannt, die noch geprüft werden muss.")}<br />{copy(ACCOUNT_CHECK_BODY_LINE_2, "Die Daten auf dem iPhone bleiben erhalten und es wurde nichts überschrieben.")}
          </p>
        ) : (
          <p className="muted">{bodyCopy}</p>
        )}
        {(phase === "review" || phase === "confirm") ? (
          <p className="muted">{copy("Để an toàn, ứng dụng sẽ tạo một bản sao lưu trên iPhone trước khi khôi phục. Safari có thể hỏi nơi lưu file. Hãy chọn ‘Tải về’.", "Zur Sicherheit erstellt die App vor der Wiederherstellung eine Sicherung auf dem iPhone. Safari fragt möglicherweise nach dem Speicherort. Wählen Sie ‚Laden‘.")}</p>
        ) : null}

        <table aria-label={copy("Tóm tắt dữ liệu trên thiết bị", "Zusammenfassung der Gerätedaten")} style={{ width: "100%", fontSize: ".9rem" }}>
          <tbody>
            <tr><td>{copy("Cài đặt", "Einstellungen")}</td><td>{counts.settings}</td></tr>
            <tr><td>{copy("Mục tiêu", "Ziele")}</td><td>{counts.goals}</td></tr>
            <tr><td>{copy("Giao dịch", "Transaktionen")}</td><td>{counts.transactions}</td></tr>
            <tr><td>Checklist</td><td>{counts.annualChecklists}</td></tr>
            <tr><td>Snapshots</td><td>{counts.monthlySnapshots}</td></tr>
          </tbody>
        </table>

        {message ? <div className="banner error" role="alert">{message}</div> : null}
        <div className="stack">
          {phase === "review" ? (
            <>
              <button type="button" disabled={busy || total === 0} onClick={() => void beginRestore()}>
                {busy ? copy("Đang tạo bản sao lưu…", "Sicherung wird erstellt…") : backupFailed ? copy("Thử tạo bản sao lưu lại", "Sicherung erneut erstellen") : copy("Khôi phục dữ liệu trên thiết bị", "Daten auf diesem Gerät wiederherstellen")}
              </button>
              <button type="button" className="secondary" disabled={busy} onClick={handleBack}>{copy(BACK_LABEL, "Zurück — Daten nicht wiederherstellen")}</button>
            </>
          ) : null}
          {phase === "account-check" ? (
            <>
              <button type="button" disabled={busy} onClick={() => void checkAccountData()}>{busy ? copy("Đang kiểm tra…", "Wird geprüft…") : copy(ACCOUNT_CHECK_PRIMARY, "Kontodaten prüfen")}</button>
              <button type="button" className="secondary" disabled={busy} onClick={handleBack}>{copy(BACK_LABEL, "Zurück — Daten nicht wiederherstellen")}</button>
            </>
          ) : null}
          {phase === "account-verified" ? (
            <button type="button" className="secondary" disabled={busy} onClick={handleBack}>{copy(BACK_LABEL, "Zurück — Daten nicht wiederherstellen")}</button>
          ) : null}
          {phase === "prepare-failed" ? (
            <>
              <button type="button" disabled={busy || total === 0} onClick={() => void retryPrepare()}>{busy ? copy("Đang chuẩn bị…", "Wird vorbereitet…") : copy(PREPARE_RETRY_LABEL, "Vorbereitung erneut versuchen")}</button>
              <button type="button" className="secondary" disabled={busy} onClick={handleBack}>{copy(BACK_LABEL, "Zurück — Daten nicht wiederherstellen")}</button>
            </>
          ) : null}
          {phase === "queued" ? (
            <button type="button" disabled={busy} onClick={() => void verifyWithAccount()}>{busy ? copy("Đang kiểm tra…", "Wird geprüft…") : copy("Kiểm tra dữ liệu trong tài khoản", "Kontodaten prüfen")}</button>
          ) : null}
          {phase === "unverified" ? (
            <button type="button" disabled={busy} onClick={() => void verifyWithAccount()}>{busy ? copy("Đang kiểm tra…", "Wird geprüft…") : copy("Thử kiểm tra lại", "Erneut prüfen")}</button>
          ) : null}
          {phase === "conflict" ? (
            <button type="button" disabled={busy} onClick={() => setShowConflicts(true)}>{copy("Xem xung đột", "Konflikte ansehen")}</button>
          ) : null}
          {phase === "complete" ? (
            <button type="button" disabled={busy} onClick={() => void finishRecovery()}>{busy ? copy("Đang mở dữ liệu…", "Daten werden geöffnet…") : copy("Kiểm tra dữ liệu", "Daten prüfen")}</button>
          ) : null}
        </div>
      </div>

      {showConflicts && phase === "conflict" ? (
        <SyncConflictSection userId={userId} onResolved={refreshAfterConflict} />
      ) : null}

      {phase === "confirm" ? (
        <div className="modal-backdrop" role="presentation">
          <div className="card modal-card" role="dialog" aria-modal="true" aria-labelledby="recovery-confirm-title">
            <h2 id="recovery-confirm-title">{copy("Khôi phục dữ liệu vào tài khoản?", "Daten in diesem Konto wiederherstellen?")}</h2>
            <p>{copy("Dữ liệu tìm thấy trên iPhone sẽ được đưa vào tài khoản này. Nếu bản trên server khác, ứng dụng sẽ dừng để hỏi bạn; không tự ghi đè dữ liệu.", "Die auf dem iPhone gefundenen Daten werden in dieses Konto übernommen. Falls die Serverversion abweicht, hält die App an und fragt Sie; sie überschreibt keine Daten automatisch.")}</p>
            <div className="stack">
              <button type="button" data-dialog-close className="secondary" disabled={busy} onClick={() => { setPhase("review"); setMessage(""); }}>{copy("Quay lại", "Zurück")}</button>
              <button type="button" disabled={busy} onClick={() => void confirmRestore()}>{busy ? copy("Đang chuẩn bị…", "Wird vorbereitet…") : copy("Xác nhận khôi phục dữ liệu", "Datenwiederherstellung bestätigen")}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
