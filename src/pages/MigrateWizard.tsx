import { useEffect, useState } from "react";
import { countLocalData, db, exportBackup } from "../lib/db";
import { listConflicts, listDeadOutbox } from "../lib/sync/engine";
import { enqueueOutbox, outboxCount } from "../lib/sync/outbox";
import type { EntityTable } from "../lib/sync/types";

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
type Phase = "review" | "confirm" | "complete";
type RecoverableRow = { id: string; version?: unknown; [key: string]: unknown };

const EMPTY_COUNTS: Counts = {
  settings: 0,
  goals: 0,
  transactions: 0,
  annualChecklists: 0,
  monthlySnapshots: 0,
};
const BACKUP_FAILURE_MESSAGE =
  "Chưa tạo được bản sao lưu. Dữ liệu trên thiết bị vẫn được giữ nguyên.";
const RECOVERY_FAILURE_MESSAGE =
  "Chưa thể khôi phục dữ liệu. Dữ liệu trên thiết bị vẫn được giữ nguyên.";

function recoveryPayload(row: RecoverableRow): {
  payload: RecoverableRow & { version: number };
  expectedRemoteVersion: number;
} {
  const current =
    typeof row.version === "number" && Number.isFinite(row.version)
      ? Math.max(0, Math.trunc(row.version))
      : 0;
  return {
    payload: { ...row, version: current + 1 },
    expectedRemoteVersion: current,
  };
}

export default function MigrateWizard({ userId: _userId, onDone, onBack }: Props) {
  const [counts, setCounts] = useState<Counts>(EMPTY_COUNTS);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [phase, setPhase] = useState<Phase>("review");
  const [backupFailed, setBackupFailed] = useState(false);
  const [completionHasBlockers, setCompletionHasBlockers] = useState(false);

  useEffect(() => {
    void countLocalData()
      .then((next) => setCounts(next))
      .catch(() => setMessage("Không thể đọc tóm tắt dữ liệu. Dữ liệu trên thiết bị vẫn được giữ nguyên."));
  }, []);

  const total =
    counts.settings + counts.goals + counts.transactions +
    counts.annualChecklists + counts.monthlySnapshots;

  async function initiateBackupDownload(): Promise<void> {
    if (
      typeof document === "undefined" ||
      typeof Blob === "undefined" ||
      typeof URL === "undefined" ||
      typeof URL.createObjectURL !== "function"
    ) {
      throw new Error("Backup unavailable");
    }
    const payload = await exportBackup();
    const objectUrl = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
    );
    try {
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = "ban-sao-luu-truoc-khi-khoi-phuc.json";
      anchor.setAttribute("aria-label", "Bản sao lưu trước khi khôi phục");
      anchor.click();
    } finally {
      if (typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(objectUrl);
    }
  }

  async function beginRestore() {
    if (busy || total === 0) return;
    setBusy(true);
    setMessage("");
    setBackupFailed(false);
    try {
      await initiateBackupDownload();
      setPhase("confirm");
    } catch {
      setBackupFailed(true);
      setMessage(BACKUP_FAILURE_MESSAGE);
      setPhase("review");
    } finally {
      setBusy(false);
    }
  }

  async function queueGuardedRow(
    table: EntityTable,
    row: RecoverableRow,
    put: (value: never) => Promise<unknown>,
  ) {
    const { payload, expectedRemoteVersion } = recoveryPayload(row);
    await put(payload as never);
    await enqueueOutbox(table, row.id, "upsert", payload, payload.version, {
      expectedRemoteVersion,
    });
  }

  async function confirmRestore() {
    if (busy || total === 0 || phase !== "confirm") return;
    setBusy(true);
    setMessage("");
    try {
      await db.transaction(
        "rw",
        [db.settings, db.goals, db.transactions, db.annualChecklists, db.monthlySnapshots, db.outbox],
        async () => {
          const settings = await db.settings.toArray();
          for (const row of settings) {
            await queueGuardedRow("settings", row as RecoverableRow, (value) => db.settings.put(value));
          }
          const goals = await db.goals.toArray();
          for (const row of goals) {
            await queueGuardedRow("goals", row as RecoverableRow, (value) => db.goals.put(value));
          }
          const transactions = await db.transactions.toArray();
          for (const row of transactions) {
            await queueGuardedRow("transactions", row as RecoverableRow, (value) => db.transactions.put(value));
          }
          const checklists = await db.annualChecklists.toArray();
          for (const row of checklists) {
            await queueGuardedRow("annualChecklists", row as RecoverableRow, (value) => db.annualChecklists.put(value));
          }
          const snapshots = await db.monthlySnapshots.toArray();
          for (const row of snapshots) {
            await queueGuardedRow("monthlySnapshots", row as RecoverableRow, (value) => db.monthlySnapshots.put(value));
          }
        },
      );

      const [refreshedCounts, queued, dead, conflicts] = await Promise.all([
        countLocalData(),
        outboxCount(),
        listDeadOutbox(),
        listConflicts(),
      ]);
      setCounts(refreshedCounts);
      setCompletionHasBlockers(queued > 0 || dead.length > 0 || conflicts.length > 0);
      setPhase("complete");
    } catch {
      setMessage(RECOVERY_FAILURE_MESSAGE);
      setPhase("review");
    } finally {
      setBusy(false);
    }
  }

  async function finishRecovery() {
    if (busy || phase !== "complete") return;
    setBusy(true);
    setMessage("");
    try {
      await onDone();
    } catch {
      setMessage("Chưa thể mở Cài đặt → Dữ liệu. Dữ liệu trên thiết bị vẫn được giữ nguyên.");
    } finally {
      setBusy(false);
    }
  }

  function handleBack() {
    setPhase("review");
    setMessage("Dữ liệu trên thiết bị vẫn được giữ nguyên và sẽ chờ bạn khôi phục.");
    onBack();
  }

  return (
    <div className="app-shell">
      <div className="card">
        <h1 className="page-title">
          {phase === "complete" ? "Đã khôi phục dữ liệu" : "Khôi phục dữ liệu trên thiết bị"}
        </h1>
        {phase === "complete" ? (
          <p className="muted">
            Dữ liệu trên thiết bị đã được đưa vào tài khoản. Hãy kiểm tra Cài đặt → Dữ liệu trước khi đăng xuất.
          </p>
        ) : (
          <>
            <p className="muted">
              Đã tìm thấy dữ liệu cũ trên iPhone này. Khôi phục để dùng lại với tài khoản của bạn.
            </p>
            <p className="muted">
              Để an toàn, ứng dụng sẽ tạo một bản sao lưu trên iPhone trước khi khôi phục. Safari có thể hỏi nơi lưu file. Hãy chọn ‘Tải về’.
            </p>
          </>
        )}

        <table aria-label="Tóm tắt dữ liệu trên thiết bị" style={{ width: "100%", fontSize: ".9rem" }}>
          <tbody>
            <tr><td>Cài đặt</td><td>{counts.settings}</td></tr>
            <tr><td>Mục tiêu</td><td>{counts.goals}</td></tr>
            <tr><td>Giao dịch</td><td>{counts.transactions}</td></tr>
            <tr><td>Checklist</td><td>{counts.annualChecklists}</td></tr>
            <tr><td>Snapshots</td><td>{counts.monthlySnapshots}</td></tr>
          </tbody>
        </table>

        {completionHasBlockers && phase === "complete" ? (
          <div className="banner" role="status">Cần hoàn tất đồng bộ trước khi đăng xuất.</div>
        ) : null}
        {message ? <div className="banner error" role="alert">{message}</div> : null}

        <div className="stack">
          {phase === "review" ? (
            <>
              <button type="button" disabled={busy || total === 0} onClick={() => void beginRestore()}>
                {busy ? "Đang tạo bản sao lưu…" : backupFailed ? "Thử tạo bản sao lưu lại" : "Khôi phục dữ liệu trên thiết bị"}
              </button>
              <button type="button" className="secondary" disabled={busy} onClick={handleBack}>
                Quay lại — chưa khôi phục dữ liệu
              </button>
            </>
          ) : null}
          {phase === "complete" ? (
            <button type="button" disabled={busy} onClick={() => void finishRecovery()}>
              {busy ? "Đang mở dữ liệu…" : "Kiểm tra dữ liệu"}
            </button>
          ) : null}
        </div>
      </div>

      {phase === "confirm" ? (
        <div className="modal-backdrop" role="presentation">
          <div className="card modal-card" role="dialog" aria-modal="true" aria-labelledby="recovery-confirm-title">
            <h2 id="recovery-confirm-title">Khôi phục dữ liệu vào tài khoản?</h2>
            <p>
              Dữ liệu tìm thấy trên iPhone sẽ được đưa vào tài khoản này. Nếu bản trên server khác, ứng dụng sẽ dừng để hỏi bạn; không tự ghi đè dữ liệu.
            </p>
            <div className="stack">
              <button type="button" className="secondary" disabled={busy} onClick={() => { setPhase("review"); setMessage(""); }}>
                Quay lại
              </button>
              <button type="button" disabled={busy} onClick={() => void confirmRestore()}>
                {busy ? "Đang khôi phục…" : "Xác nhận khôi phục dữ liệu"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
