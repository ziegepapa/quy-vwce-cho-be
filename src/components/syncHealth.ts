import type { AppLocale } from "../lib/locale";

export type SyncHealthState =
  | "signed-out"
  | "recovery"
  | "conflict"
  | "retry"
  | "offline"
  | "syncing"
  | "pending"
  | "synced";

export type SyncHealthInput = {
  signedIn: boolean;
  online: boolean;
  running: boolean;
  pending: number;
  dead: number;
  conflicts: number;
  recoveryPending: boolean;
};

export type SyncHealth = SyncHealthInput & {
  state: SyncHealthState;
  tone: "safe" | "info" | "attention" | "blocked";
  action: "none" | "sign-in" | "recover" | "conflicts" | "retry" | "sync";
};

export type SyncHealthCopy = {
  title: string;
  detail: string;
  actionLabel: string | null;
  menuMeta: string;
};

export function buildSyncHealth(input: SyncHealthInput): SyncHealth {
  const pending = Math.max(0, input.pending);
  const dead = Math.max(0, input.dead);
  const conflicts = Math.max(0, input.conflicts);

  if (!input.signedIn) return { ...input, pending, dead, conflicts, state: "signed-out", tone: "info", action: "sign-in" };
  if (input.recoveryPending) return { ...input, pending, dead, conflicts, state: "recovery", tone: "blocked", action: "recover" };
  if (conflicts > 0) return { ...input, pending, dead, conflicts, state: "conflict", tone: "blocked", action: "conflicts" };
  if (dead > 0) return { ...input, pending, dead, conflicts, state: "retry", tone: "attention", action: "retry" };
  if (!input.online) return { ...input, pending, dead, conflicts, state: "offline", tone: "attention", action: "none" };
  if (input.running) return { ...input, pending, dead, conflicts, state: "syncing", tone: "info", action: "none" };
  if (pending > 0) return { ...input, pending, dead, conflicts, state: "pending", tone: "attention", action: "sync" };
  return { ...input, pending, dead, conflicts, state: "synced", tone: "safe", action: "none" };
}

export function syncHealthCopy(health: SyncHealth, locale: AppLocale): SyncHealthCopy {
  const de = locale === "de";
  switch (health.state) {
    case "signed-out":
      return de
        ? { title: "Nur auf diesem Gerät", detail: "Melden Sie sich an, um Daten zwischen Geräten zu synchronisieren.", actionLabel: null, menuMeta: "Nicht angemeldet" }
        : { title: "Chỉ trên thiết bị này", detail: "Đăng nhập để đồng bộ dữ liệu giữa các thiết bị.", actionLabel: null, menuMeta: "Chưa đăng nhập" };
    case "recovery":
      return de
        ? { title: "Wiederherstellung erforderlich", detail: "Gerätedaten bleiben unverändert. Schließen Sie die Wiederherstellung ab, bevor Sie synchronisieren oder sich abmelden.", actionLabel: "Wiederherstellung fortsetzen", menuMeta: "Wiederherstellung" }
        : { title: "Cần khôi phục dữ liệu", detail: "Dữ liệu trên thiết bị vẫn giữ nguyên. Hãy hoàn tất khôi phục trước khi đồng bộ hoặc đăng xuất.", actionLabel: "Tiếp tục khôi phục", menuMeta: "Khôi phục" };
    case "conflict":
      return de
        ? { title: `${health.conflicts} Datenkonflikt${health.conflicts === 1 ? "" : "e"}`, detail: "Es wurde nichts automatisch überschrieben. Prüfen Sie die Versionen und wählen Sie bewusst eine Auflösung.", actionLabel: "Konflikte prüfen", menuMeta: "Konflikt" }
        : { title: `${health.conflicts} xung đột dữ liệu`, detail: "Không có dữ liệu nào bị tự ghi đè. Hãy xem các phiên bản và chủ động chọn cách xử lý.", actionLabel: "Xem xung đột", menuMeta: "Xung đột" };
    case "retry":
      return de
        ? { title: `${health.dead} Vorgang${health.dead === 1 ? "" : "e"} braucht eine erneute Synchronisierung`, detail: "Die Änderungen bleiben auf diesem Gerät erhalten. Versuchen Sie die Synchronisierung erneut, sobald eine Verbindung besteht.", actionLabel: "Erneut synchronisieren", menuMeta: `${health.dead} erneut versuchen` }
        : { title: `${health.dead} việc cần đồng bộ lại`, detail: "Các thay đổi vẫn được giữ trên thiết bị. Hãy thử đồng bộ lại khi có kết nối.", actionLabel: "Đồng bộ lại", menuMeta: `${health.dead} cần thử lại` };
    case "offline":
      return de
        ? { title: "Offline", detail: "Ihre Änderungen bleiben sicher auf diesem Gerät und werden erst bei einer Verbindung synchronisiert.", actionLabel: null, menuMeta: "Offline" }
        : { title: "Đang ngoại tuyến", detail: "Các thay đổi vẫn an toàn trên thiết bị và chỉ đồng bộ khi có kết nối.", actionLabel: null, menuMeta: "Ngoại tuyến" };
    case "syncing":
      return de
        ? { title: "Synchronisierung läuft", detail: "Bitte warten Sie, bis der aktuelle Abgleich abgeschlossen ist.", actionLabel: null, menuMeta: "Wird synchronisiert" }
        : { title: "Đang đồng bộ", detail: "Vui lòng chờ lượt đồng bộ hiện tại hoàn tất.", actionLabel: null, menuMeta: "Đang đồng bộ" };
    case "pending":
      return de
        ? { title: `${health.pending} Änderung${health.pending === 1 ? "" : "en"} ausstehend`, detail: "Die Änderungen sind auf diesem Gerät gespeichert und warten auf die Synchronisierung.", actionLabel: "Jetzt synchronisieren", menuMeta: `${health.pending} ausstehend` }
        : { title: `${health.pending} thay đổi đang chờ`, detail: "Các thay đổi đã lưu trên thiết bị và đang chờ đồng bộ.", actionLabel: "Đồng bộ ngay", menuMeta: `${health.pending} chờ` };
    case "synced":
      return de
        ? { title: "Synchronisiert", detail: "Keine offenen Änderungen oder Konflikte wurden erkannt.", actionLabel: "Jetzt synchronisieren", menuMeta: "Synchronisiert" }
        : { title: "Đã đồng bộ", detail: "Không phát hiện thay đổi hoặc xung đột đang chờ.", actionLabel: "Đồng bộ ngay", menuMeta: "Đã đồng bộ" };
  }
}
