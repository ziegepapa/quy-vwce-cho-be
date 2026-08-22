import { useMemo, useState } from "react";
import type { AppSettings, PlanTarget, Transaction } from "../lib/types";
import { planDateYear } from "../lib/planPhase";
import { buildPlanVsReality } from "../pages/planVsReality";
import {
  IconArchive,
  IconChevronRight,
  IconGoal,
  IconLanguage,
  IconLock,
  IconSettings,
  IconShield,
  IconSliders,
  IconSync,
} from "./Icons";

type WorkspaceTab = "today" | "plan" | "vault";
type VaultAction = "password" | "mfa" | "diagnostics" | "backup" | "restore";

type AnnualRow = {
  year: number;
  kind: "recorded" | "current" | "future" | "use";
  planned: number;
  actual: number | null;
  recordedMonths: number | null;
  plannedMonths: number;
};

function isDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(new Date(`${value}T12:00:00`).getTime());
}

function formatMoney(value: number, locale: "vi" | "de"): string {
  return new Intl.NumberFormat(locale === "de" ? "de-DE" : "vi-VN", {
    style: "currency", currency: "EUR", maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string, locale: "vi" | "de"): string {
  if (!isDate(value)) return "—";
  return new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "vi-VN", {
    day: "2-digit", month: "short", year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

function monthsIn(year: number, startDate: string, targetDate: string): number {
  if (!isDate(startDate) || !isDate(targetDate)) return 0;
  const start = new Date(`${startDate}T12:00:00`);
  const target = new Date(`${targetDate}T12:00:00`);
  const from = new Date(Math.max(start.getTime(), new Date(year, 0, 1, 12).getTime()));
  const to = new Date(Math.min(target.getTime(), new Date(year, 11, 31, 12).getTime()));
  return from > to ? 0 : to.getMonth() - from.getMonth() + 1;
}

function buildRows(input: {
  target: PlanTarget;
  startDate: string;
  contributionY1: number;
  contributionY2: number;
  trackInAppCash?: boolean;
  transactions: readonly Transaction[];
  today: Date;
}): AnnualRow[] {
  const targetYear = planDateYear(input.target.targetUseDate);
  if (!targetYear || !isDate(input.startDate)) return [];
  const startYear = new Date(`${input.startDate}T12:00:00`).getFullYear();
  const currentYear = input.today.getFullYear();
  if (targetYear < startYear || targetYear - startYear > 30) return [];
  const today = `${input.today.getFullYear()}-${String(input.today.getMonth() + 1).padStart(2, "0")}-${String(input.today.getDate()).padStart(2, "0")}`;
  return Array.from({ length: targetYear - startYear + 1 }, (_, index) => {
    const year = startYear + index;
    if (year <= currentYear) {
      const reality = buildPlanVsReality({
        startDate: input.startDate,
        contributionY1: input.contributionY1,
        contributionY2: input.contributionY2,
        trackInAppCash: input.trackInAppCash,
        transactions: input.transactions,
        today,
        year,
      });
      return {
        year,
        kind: year === currentYear ? "current" : "recorded",
        planned: reality.plannedAmount,
        actual: reality.actualAmount,
        recordedMonths: reality.recordedMonths,
        plannedMonths: reality.plannedMonths,
      };
    }
    const plannedMonths = monthsIn(year, input.startDate, input.target.targetUseDate);
    const monthly = index === 0 ? input.contributionY1 : input.contributionY2;
    return {
      year,
      kind: year === targetYear ? "use" : "future",
      planned: Math.max(0, plannedMonths * Math.max(0, monthly)),
      actual: null,
      recordedMonths: null,
      plannedMonths,
    };
  });
}

export default function SettingsClarityWorkspace({
  settings,
  transactions,
  locale,
  saveLabel,
  syncLabel,
  syncing,
  lastSync,
  onSync,
  onChangeTarget,
  onOpenVaultAction,
  onTheme,
  onLocale,
}: {
  settings: AppSettings;
  transactions: readonly Transaction[];
  locale: "vi" | "de";
  saveLabel: string;
  syncLabel: string;
  syncing: boolean;
  lastSync: string | null;
  onSync: () => void;
  onChangeTarget: (next: PlanTarget) => void;
  onOpenVaultAction: (action: VaultAction) => void;
  onTheme: (next: "premium" | "dark" | "light") => void;
  onLocale: (next: "vi" | "de") => void;
}) {
  const [tab, setTab] = useState<WorkspaceTab>("today");
  const today = useMemo(() => new Date(), []);
  const target = settings.planTarget ?? { targetUseDate: settings.endDate, needFullAmount: true };
  const rows = useMemo(() => buildRows({
    target,
    startDate: settings.startDate,
    contributionY1: settings.contributionY1,
    contributionY2: settings.contributionY2,
    trackInAppCash: settings.trackInAppCash,
    transactions,
    today,
  }), [settings, target, transactions, today]);
  const currentYear = today.getFullYear();
  const initialYear = rows.find((row) => row.kind === "current")?.year ?? rows[0]?.year ?? currentYear;
  const [selectedYear, setSelectedYear] = useState(initialYear);
  const selected = rows.find((row) => row.year === selectedYear) ?? null;

  const vi = locale === "vi";
  const statusName = (kind: AnnualRow["kind"]) => vi
    ? ({ recorded: "Đã ghi nhận", current: "Năm hiện tại", future: "Dự kiến", use: "Sử dụng tiền" }[kind])
    : ({ recorded: "Erfasst", current: "Dieses Jahr", future: "Vorgemerkt", use: "Verwendung" }[kind]);
  const monthLabel = vi ? "tháng" : "Monate";
  const planReady = rows.length > 0;
  const selectedActual = selected?.actual == null ? "—" : formatMoney(selected.actual, locale);
  const selectedPlanned = selected?.planned ? formatMoney(selected.planned, locale) : "—";
  const selectedMonths = selected?.actual == null
    ? `${selected?.plannedMonths ?? 0} ${monthLabel}`
    : `${selected.recordedMonths ?? 0}/${selected.plannedMonths} ${monthLabel}`;
  const focusText = !planReady
    ? (vi ? "Hoàn tất mốc sử dụng để mở kế hoạch theo năm" : "Verwendungsdatum ergänzen, um den Jahresplan zu öffnen")
    : selected?.kind === "current"
      ? (vi ? `Theo dõi kế hoạch ${selected.year}` : `Plan ${selected.year} prüfen`)
      : (vi ? `Xem lộ trình đến ${formatDate(target.targetUseDate, locale)}` : `Fahrplan bis ${formatDate(target.targetUseDate, locale)} ansehen`);

  return (
    <section className="clarity-workspace" aria-label={vi ? "Trung tâm điều hành cài đặt" : "Einstellungszentrale"}>
      <header className="clarity-topbar">
        <div className="clarity-brand"><span>VWCE</span><strong>{vi ? "TRUNG TÂM GIA ĐÌNH" : "FAMILIENZENTRALE"}</strong></div>
        <div className="clarity-save" role="status"><i aria-hidden />{saveLabel}</div>
      </header>

      <nav className="clarity-tabs" aria-label={vi ? "Không gian cài đặt" : "Einstellungsbereiche"}>
        {(["today", "plan", "vault"] as WorkspaceTab[]).map((item) => {
          const label = vi ? ({ today: "Hôm nay", plan: "Kế hoạch", vault: "Vault" }[item]) : ({ today: "Heute", plan: "Plan", vault: "Vault" }[item]);
          return <button key={item} type="button" className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{label}</button>;
        })}
      </nav>

      {tab === "today" ? (
        <div className="clarity-page clarity-today">
          <p className="clarity-eyebrow">{vi ? "BẢNG ĐIỀU HÀNH" : "ÜBERBLICK"}</p>
          <h1>{vi ? "Ít nhiễu hơn. Quyết định rõ hơn." : "Weniger Rauschen. Mehr Klarheit."}</h1>
          <section className="clarity-focus">
            <span>{vi ? "Ưu tiên tiếp theo" : "Nächster Fokus"}</span>
            <strong>{focusText}</strong>
            <button type="button" onClick={() => setTab("plan")}>{vi ? "Mở kế hoạch" : "Plan öffnen"}<IconChevronRight /></button>
          </section>
          <section className="clarity-status-list" aria-label={vi ? "Trạng thái" : "Status"}>
            <div><span>{vi ? "Đồng bộ" : "Synchronisierung"}</span><strong><i className={syncing ? "is-busy" : ""} />{syncing ? (vi ? "Đang đồng bộ" : "Synchronisiert") : syncLabel}</strong><small>{lastSync ?? (vi ? "Chưa có đồng bộ cục bộ" : "Noch kein lokaler Abgleich")}</small><button type="button" onClick={onSync} disabled={syncing}><IconSync />{vi ? "Đồng bộ ngay" : "Jetzt synchronisieren"}</button></div>
            <div><span>{vi ? "Mốc sử dụng" : "Verwendungsziel"}</span><strong>{planReady ? formatDate(target.targetUseDate, locale) : "—"}</strong><small>{target.needFullAmount ? (vi ? "Dùng gần như toàn bộ danh mục" : "Nahezu gesamtes Vermögen vorgesehen") : (vi ? "Dùng một phần danh mục" : "Teilbetrag vorgesehen")}</small><button type="button" onClick={() => setTab("plan")}>{vi ? "Xem lộ trình" : "Fahrplan ansehen"}<IconChevronRight /></button></div>
            <div><span>{vi ? "Bảo vệ Vault" : "Vault-Schutz"}</span><strong>{vi ? "Mật khẩu & MFA" : "Passwort & MFA"}</strong><small>{vi ? "Chỉ thay đổi khi chủ sở hữu yêu cầu" : "Änderungen nur auf Eigentümerwunsch"}</small><button type="button" onClick={() => setTab("vault")}>{vi ? "Mở Vault" : "Vault öffnen"}<IconChevronRight /></button></div>
          </section>
        </div>
      ) : null}

      {tab === "plan" ? (
        <div className="clarity-page clarity-plan">
          <div className="clarity-plan-title"><div><p className="clarity-eyebrow">{vi ? "KẾ HOẠCH THEO NĂM" : "JAHRESPLAN"}</p><h1>{vi ? "Một năm. Một bức tranh rõ." : "Ein Jahr. Ein klares Bild."}</h1></div><div><span>{vi ? "Mốc sử dụng" : "Verwendungsdatum"}</span><strong>{formatDate(target.targetUseDate, locale)}</strong></div></div>
          {!planReady ? <section className="clarity-empty"><IconGoal /><strong>{vi ? "Chưa đủ dữ liệu kế hoạch" : "Noch keine Planbasis"}</strong><p>{vi ? "Hãy nhập ngày bắt đầu và mốc sử dụng hợp lệ. Ứng dụng sẽ không tạo số tiền khi thiếu nền tảng." : "Bitte gültigen Start- und Verwendungstermin eintragen. Die App erzeugt ohne Grundlage keine Beträge."}</p></section> : <>
            <div className="clarity-year-switcher" role="list" aria-label={vi ? "Chọn năm" : "Jahr auswählen"}>{rows.map((row) => <button type="button" key={row.year} role="listitem" className={`${row.kind} ${selectedYear === row.year ? "selected" : ""}`} onClick={() => setSelectedYear(row.year)}><span>{statusName(row.kind)}</span><strong>{row.year}</strong></button>)}</div>
            {selected ? <section className="clarity-year-board" aria-label={`${statusName(selected.kind)} ${selected.year}`}>
              <header><span>{statusName(selected.kind)}</span><h2>{selected.year}</h2><p>{selected.kind === "use" ? (vi ? "Mốc sử dụng tiền do chủ sở hữu xác nhận." : "Vom Eigentümer bestätigter Verwendungszeitpunkt.") : (vi ? "Mức góp dựa trên Sparplan và các giao dịch đã ghi nhận." : "Beiträge basieren auf Sparplan und erfassten Buchungen.")}</p></header>
              <dl><div><dt>{vi ? "Theo Sparplan" : "Nach Sparplan"}</dt><dd>{selectedPlanned}</dd></div><div><dt>{vi ? "Đã ghi nhận" : "Erfasst"}</dt><dd>{selectedActual}</dd></div><div><dt>{vi ? "Nhịp góp" : "Beitragsrhythmus"}</dt><dd>{selectedMonths}</dd></div></dl>
              <p className="clarity-source"><IconSettings />{vi ? "Nguồn: Sparplan hiện có và ledger đã ghi nhận. Không có lệnh mua, bán hay đổi tỷ trọng." : "Quelle: vorhandener Sparplan und erfasstes Ledger. Keine Kauf-, Verkaufs- oder Umschichtungsanweisung."}</p>
            </section> : null}
          </>}
          <details className="clarity-plan-controls"><summary>{vi ? "Điều chỉnh nền tảng kế hoạch" : "Planbasis bearbeiten"}</summary><div><label><span>{vi ? "Mốc sử dụng tiền" : "Verwendungsdatum"}</span><input aria-label={vi ? "Mốc sử dụng tiền" : "Verwendungsdatum"} type="date" value={target.targetUseDate} onChange={(event) => onChangeTarget({ ...target, targetUseDate: event.target.value })} /></label><label className="clarity-check"><input aria-label={vi ? "Dùng gần như toàn bộ danh mục" : "Nahezu gesamtes Vermögen verwenden"} type="checkbox" checked={target.needFullAmount} onChange={(event) => onChangeTarget({ ...target, needFullAmount: event.target.checked, partialNeedEuro: event.target.checked ? undefined : target.partialNeedEuro })} /><span>{vi ? "Dùng gần như toàn bộ danh mục tại mốc này" : "Nahezu gesamtes Vermögen zu diesem Zeitpunkt verwenden"}</span></label>{!target.needFullAmount ? <label><span>{vi ? "Số tiền dự kiến cần dùng" : "Vorgesehener Teilbetrag"}</span><input aria-label={vi ? "Số tiền dự kiến cần dùng" : "Vorgesehener Teilbetrag"} type="number" inputMode="decimal" min="0" value={target.partialNeedEuro ?? ""} onChange={(event) => { const value = event.target.value; onChangeTarget({ ...target, partialNeedEuro: value === "" ? undefined : Math.max(0, Number(value) || 0) }); }} /></label> : null}</div></details>
        </div>
      ) : null}

      {tab === "vault" ? (
        <div className="clarity-page clarity-vault">
          <p className="clarity-eyebrow">{vi ? "QUẢN TRỊ VAULT" : "VAULT-VERWALTUNG"}</p><h1>{vi ? "Quyền kiểm soát, không lẫn lộn." : "Kontrolle, ohne Unordnung."}</h1>
          <section className="clarity-vault-list">
            <button type="button" onClick={() => onOpenVaultAction("password")}><IconLock /><span><strong>{vi ? "Mật khẩu" : "Passwort"}</strong><small>{vi ? "Yêu cầu liên kết đổi hoặc khôi phục" : "Änderungs- oder Wiederherstellungslink anfordern"}</small></span><IconChevronRight /></button>
            <button type="button" onClick={() => onOpenVaultAction("mfa")}><IconShield /><span><strong>{vi ? "Xác thực hai lớp" : "Zwei-Faktor-Schutz"}</strong><small>{vi ? "Bảo vệ truy cập Vault" : "Zugang zum Vault schützen"}</small></span><IconChevronRight /></button>
            <button type="button" onClick={() => onOpenVaultAction("backup")}><IconArchive /><span><strong>{vi ? "Sao lưu" : "Datensicherung"}</strong><small>{vi ? "Xuất dữ liệu do chủ sở hữu kiểm soát" : "Eigentümergesteuerter Datenexport"}</small></span><IconChevronRight /></button>
            <button type="button" onClick={() => onOpenVaultAction("restore")}><IconArchive /><span><strong>{vi ? "Khôi phục" : "Wiederherstellen"}</strong><small>{vi ? "Nhập bản sao có bước bảo vệ" : "Sicherung mit Schutzschritten importieren"}</small></span><IconChevronRight /></button>
            <button type="button" onClick={() => onOpenVaultAction("diagnostics")}><IconSliders /><span><strong>{vi ? "Chẩn đoán đồng bộ" : "Synchronisierungsdiagnose"}</strong><small>{vi ? "Trạng thái cục bộ trên thiết bị" : "Lokaler Gerätestatus"}</small></span><IconChevronRight /></button>
          </section>
          <section className="clarity-preferences"><div><span><IconLanguage />{vi ? "Ngôn ngữ" : "Sprache"}</span><div><button type="button" className={locale === "vi" ? "selected" : ""} onClick={() => onLocale("vi")}>Tiếng Việt</button><button type="button" className={locale === "de" ? "selected" : ""} onClick={() => onLocale("de")}>Deutsch</button></div></div><div><span><IconSettings />{vi ? "Giao diện" : "Darstellung"}</span><div><button type="button" onClick={() => onTheme("premium")}>{vi ? "Vault" : "Vault"}</button><button type="button" onClick={() => onTheme("dark")}>{vi ? "Ocean" : "Ozean"}</button><button type="button" onClick={() => onTheme("light")}>{vi ? "Ember" : "Ember"}</button></div></div></section>
        </div>
      ) : null}
    </section>
  );
}
