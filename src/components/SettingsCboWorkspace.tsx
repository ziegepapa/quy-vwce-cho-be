import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { AppLocale } from "../lib/locale";
import type { AppSettings, PlanTarget } from "../lib/types";
import type { ThemeChoice } from "../lib/theme";
import { IconChevronRight, IconSync } from "./Icons";
import "../styles/settings-cbo.css";

type CboTab = "general" | "prices" | "data";
type ChildAction = "password-change" | "password-reset" | "mfa" | "diagnostics" | "backup" | "restore";
type SettingsSheet = "profile" | "plan" | "simulation" | null;
type HorizonPhase = "accumulate" | "transition" | "protect" | "use";
type YearlyPlanRow = {
  year: number;
  months: number;
  monthly: number | null;
  annual: number | null;
  phase: HorizonPhase;
  vwce: number | null;
  safe: number | null;
  markers: Array<"current" | "safe" | "goal">;
};

type Props = {
  activeTab: CboTab;
  settings: AppSettings;
  locale: AppLocale;
  theme: ThemeChoice;
  saveLabel: string;
  syncLabel: string;
  syncing: boolean;
  lastSync: string | null;
  pricesPanel: ReactNode;
  dataHealthPanel: ReactNode;
  syncHealthPanel: ReactNode;
  syncConflictPanel: ReactNode;
  onSelectTab: (tab: CboTab) => void;
  onPatchSettings: (next: Partial<AppSettings>) => void;
  onChangeTarget: (next: PlanTarget) => void;
  onTheme: (next: ThemeChoice) => void;
  onLocale: (next: AppLocale) => void;
  onOpenChild: (action: ChildAction) => void;
  onSync: () => void;
  onExportCsv: () => void;
  onOpenMigrate?: () => void;
  onSignOut?: () => void;
  handoffAction?: ReactNode;
  dangerAction?: ReactNode;
};

function money(value: number, locale: AppLocale): string {
  return new Intl.NumberFormat(locale === "de" ? "de-DE" : "vi-VN", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
}

function percent(value: number, locale: AppLocale): string {
  return new Intl.NumberFormat(locale === "de" ? "de-DE" : "vi-VN", { style: "percent", maximumFractionDigits: 0 }).format(value);
}

function parseNumber(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  const result = Number(value.replace(",", "."));
  return Number.isFinite(result) ? result : undefined;
}

function parsePercent(value: string): number | undefined {
  const parsed = parseNumber(value);
  return parsed === undefined ? undefined : parsed / 100;
}

function yearsTo(value: string, today: Date): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const target = new Date(`${value}T12:00:00`);
  if (!Number.isFinite(target.getTime())) return null;
  const months = (target.getFullYear() - today.getFullYear()) * 12 + target.getMonth() - today.getMonth() - (target.getDate() < today.getDate() ? 1 : 0);
  return Math.max(0, Math.floor(months / 12));
}

function phaseFor(yearsLeft: number, deRiskYears: number): HorizonPhase {
  if (yearsLeft > deRiskYears) return "accumulate";
  if (yearsLeft > 2) return "transition";
  if (yearsLeft > 0) return "protect";
  return "use";
}

function planDate(value: string | undefined, fallbackYear: number): Date | null {
  const candidate = value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : `${fallbackYear}-01-01`;
  const parsed = new Date(`${candidate}T12:00:00`);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function monthsForPlanYear(year: number, start: Date, target: Date): number {
  const startMonth = year === start.getFullYear() ? start.getMonth() : 0;
  const endMonth = year === target.getFullYear() ? target.getMonth() : 11;
  return Math.max(0, endMonth - startMonth + 1);
}

function buildYearlyPlanRows(settings: AppSettings, target: PlanTarget, deRiskYears: number, currentYear: number): YearlyPlanRow[] {
  const start = planDate(settings.startDate, currentYear);
  const goal = planDate(target.targetUseDate || settings.endDate, currentYear);
  if (!start || !goal) return [];

  const startYear = start.getFullYear();
  const goalYear = goal.getFullYear();
  if (goalYear < startYear) return [];

  const firstMonthly = settings.contributionY1 > 0 ? settings.contributionY1 : settings.contributionY2 > 0 ? settings.contributionY2 : null;
  const recurringMonthly = settings.contributionY2 > 0 ? settings.contributionY2 : firstMonthly;
  const safeStartYear = Math.max(currentYear, goalYear - deRiskYears);

  return Array.from({ length: goalYear - startYear + 1 }, (_, index) => {
    const year = startYear + index;
    const months = monthsForPlanYear(year, start, goal);
    const monthly = year === startYear ? firstMonthly : recurringMonthly;
    const annual = monthly === null ? null : monthly * months;
    const phase = phaseFor(Math.max(0, goalYear - year), deRiskYears);
    const vwceShare = phase === "accumulate" ? 1 : phase === "transition" ? 0.5 : phase === "protect" ? 0 : null;
    const safeShare = phase === "accumulate" ? 0 : phase === "transition" ? 0.5 : phase === "protect" ? 1 : null;
    const markers: YearlyPlanRow["markers"] = [];
    if (year === currentYear) markers.push("current");
    if (year === safeStartYear) markers.push("safe");
    if (year === goalYear) markers.push("goal");
    return {
      year,
      months,
      monthly,
      annual,
      phase,
      vwce: annual === null || vwceShare === null ? null : annual * vwceShare,
      safe: annual === null || safeShare === null ? null : annual * safeShare,
      markers,
    };
  });
}

function copyFor(locale: AppLocale) {
  if (locale === "de") return {
    title: "Einstellungen", tabs: { general: "Allgemein", prices: "Kurse", data: "Daten" }, saved: "Gespeichert",
    fund: "FAMILIENFONDS", editProfile: "Profil bearbeiten", profile: "Familienprofil", planName: "Name des Plans", childName: "Name des Kindes", account: "Konto läuft auf", parent: "Eltern", child: "Kind",
    plan: "Plan", planEmpty: "Noch kein Ziel", planEmptyCopy: "Hinterlegen Sie Jahr und Zielbetrag, um den Jahresüberblick zu sehen.", addGoal: "Ziel hinzufügen", configurePlan: "Plan anpassen", annual: "DIESES JAHR", disclaimer: "Illustrative Ansicht · erfasste Buchungen bleiben unverändert.",
    phase: { accumulate: ["Aufbau", "Noch weit bis zum Zieltermin – Beiträge werden im Aufbau-Szenario gezeigt."], transition: ["Übergang", "Der Sicherheitszeitraum beginnt – neue Beiträge werden beispielhaft geteilt."], protect: ["Schutz", "Der Zieltermin rückt näher – der sichere Teil steht im Vordergrund."], use: ["Verwenden", "Zieljahr erreicht – bestätigten Bedarf und verfügbare Mittel vergleichen."] },
    contribution: "Monatlicher Beitrag", transfer: "Zusätzliche Vorschau", noTransfer: "Nicht nötig", unavailable: "Nicht verfügbar – kein bestätigter VWCE-Wert", safe: "Sicherer Teil", vwce: "VWCE", targetDate: "Zieltermin", fullAmount: "Nahezu gesamtes Vermögen verwenden", targetAmount: "Zielbetrag", safeWindow: "Sicherheitszeitraum (Vorschau)", transferRate: "Transfer-Vorschau/Jahr", milestones: ["Heute", "Sicherheit beginnt", "Zieljahr"], advanced: "Erweitert für Simulation", advancedHelp: "Rendite, Inflation und Sicherheitsmarge", simulation: "Annahmen für Ziel & Simulation", simulationNote: "Nur für Ziel und Simulation; keine Buchung wird verändert.", vwceReturn: "VWCE-Rendite", inflation: "Inflation", safeReturn: "Sicherer Teil", buffer: "Sicherheitsmarge", save: "Fertig", resultTitle: "Ergebnisvorschau", resultSafeStart: "Sicherheit ab", resultNeedYear: "Zieljahr", resultPhase: "Phase", resultThisYear: "Dieses Jahr", fullPortfolio: "Nahezu gesamtes Vermögen", transferPctYear: "Transfer-Vorschau", yearPlanTitle: "Jahresplan", yearPlanSubtitle: "Vorschau aus Ihren Plan- und Beitragsangaben · keine Buchung wird erzeugt.", currentMarker: "Heute", safeMarker: "Sicherheitsbeginn", goalMarker: "Zieljahr",
    everyday: "Im Alltag", language: "Sprache", appearance: "Darstellung", wallet: "Cash-Modell in der App", walletHelp: "Bestehende Buchungslogik bleibt unverändert.", security: "Sicherheit", password: "Passwort", recovery: "Wiederherstellungslink", mfa: "MFA / TOTP", signOut: "Abmelden",
    prices: "Kurse", pricesHelp: "Feed-Status und wirksame Kurse", pricesInfo: "Details zur Kursquelle", data: "Daten & Betrieb", sync: "Gesundheit & Synchronisierung", syncNow: "Jetzt synchronisieren", transfers: "Sicherung & Gerätewechsel", backup: "JSON sichern", restore: "Daten wiederherstellen", csv: "CSV exportieren", device: "Gerät wiederherstellen", handoff: "Notfallmappe & Übergabe", diagnostics: "Gerätedetails", danger: "Gefahrenbereich", localDetails: "Daten auf diesem Gerät", close: "Schließen", perYear: "%/Jahr", missingContribution: "Kein Monatsbeitrag konfiguriert", useNeed: "Bedarf in diesem Jahr", safeAvailable: "Sicher verfügbar",
  };
  return {
    title: "Cài đặt", tabs: { general: "Chung", prices: "Giá", data: "Dữ liệu" }, saved: "Đã lưu",
    fund: "QUỸ GIA ĐÌNH", editProfile: "Chỉnh hồ sơ", profile: "Hồ sơ gia đình", planName: "Tên kế hoạch", childName: "Tên bé", account: "Tài khoản đứng tên", parent: "Cha/mẹ", child: "Bé",
    plan: "Kế hoạch", planEmpty: "Chưa có mục tiêu", planEmptyCopy: "Thêm năm và số tiền cần để xem kế hoạch năm nay.", addGoal: "Thêm mục tiêu", configurePlan: "Tùy chỉnh kế hoạch", annual: "NĂM NAY", disclaimer: "Gợi ý minh họa · không thay đổi giao dịch đã ghi.",
    phase: { accumulate: ["Tích lũy", "Còn xa hạn — khoản góp được hiển thị theo pha tích lũy."], transition: ["Chuyển dần", "Đang vào cửa sổ an toàn — khoản góp được tách theo preview."], protect: ["Bảo vệ", "Gần hạn — phần an toàn được hiển thị nổi bật."], use: ["Rút", "Năm cần tiền — đối chiếu nhu cầu với phần an toàn đã xác nhận."] },
    contribution: "Khoản góp hằng tháng", transfer: "Preview chuyển thêm", noTransfer: "Không cần", unavailable: "Chưa có – không có giá trị VWCE đã xác nhận", safe: "Phần an toàn", vwce: "VWCE", targetDate: "Năm / ngày cần tiền", fullAmount: "Dùng gần như toàn bộ danh mục", targetAmount: "Số € mục tiêu", safeWindow: "Cửa sổ an toàn (preview)", transferRate: "Preview chuyển đổi/năm", milestones: ["Hôm nay", "Bắt đầu an toàn", "Năm cần tiền"], advanced: "Nâng cao cho mô phỏng", advancedHelp: "Lợi suất, lạm phát và biên an toàn", simulation: "Giả định mô phỏng", simulationNote: "Chỉ dùng cho mục tiêu và mô phỏng; không thay đổi giao dịch đã ghi.", vwceReturn: "Lợi suất VWCE", inflation: "Lạm phát", safeReturn: "Phần an toàn", buffer: "Biên an toàn", save: "Xong", resultTitle: "Kết quả gợi ý", resultSafeStart: "Bắt đầu an toàn", resultNeedYear: "Năm cần tiền", resultPhase: "Pha", resultThisYear: "Năm nay", fullPortfolio: "Gần như toàn bộ danh mục", transferPctYear: "Preview chuyển/năm", yearPlanTitle: "Kế hoạch từng năm", yearPlanSubtitle: "Bảng dự kiến từ năm bắt đầu đến năm cần tiền · không tạo lệnh mua/bán.", currentMarker: "Hiện tại", safeMarker: "Mốc an toàn", goalMarker: "Mốc mục tiêu",
    everyday: "Tùy chọn hằng ngày", language: "Ngôn ngữ", appearance: "Giao diện", wallet: "Ví trong app", walletHelp: "Giữ nguyên logic ghi nhận tiền nạp trước lệnh mua hiện có.", security: "Bảo mật", password: "Đổi mật khẩu", recovery: "Link khôi phục", mfa: "MFA / TOTP", signOut: "Đăng xuất",
    prices: "Giá", pricesHelp: "Trạng thái feed và giá đang dùng", pricesInfo: "Tìm hiểu nguồn giá", data: "Dữ liệu & vận hành", sync: "Sức khỏe & đồng bộ", syncNow: "Đồng bộ ngay", transfers: "Sao lưu & chuyển máy", backup: "Sao lưu JSON", restore: "Khôi phục dữ liệu", csv: "Xuất CSV", device: "Khôi phục thiết bị", handoff: "Hồ sơ khẩn cấp & bàn giao", diagnostics: "Chi tiết thiết bị", danger: "Vùng nguy hiểm", localDetails: "Dữ liệu trên thiết bị", close: "Đóng", perYear: "%/năm", missingContribution: "Chưa có khoản góp hằng tháng", useNeed: "Khoản cần năm nay", safeAvailable: "An toàn khả dụng",
  } as const;
}

function Sheet({ title, onClose, closeLabel, children }: { title: string; onClose: () => void; closeLabel: string; children: ReactNode }) {
  useEffect(() => {
    const dock = document.querySelector(".bottom-dock");
    document.documentElement.classList.add("p40-sheet-open");
    document.body.classList.add("p40-sheet-open");
    dock?.classList.add("is-hidden");
    return () => {
      document.documentElement.classList.remove("p40-sheet-open");
      document.body.classList.remove("p40-sheet-open");
      document.querySelector(".bottom-dock")?.classList.remove("is-hidden");
    };
  }, []);
  return <div className="p40-sheet-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="p40-sheet" role="dialog" aria-modal="true" aria-label={title}><div className="p40-sheet-grabber" aria-hidden /><header><strong>{title}</strong><button type="button" aria-label={closeLabel} onClick={onClose}>×</button></header><div className="p40-sheet-body">{children}</div></section></div>;
}

function PlanSummary({ settings, locale, copy, onOpenPlan, deRiskYears = 5 }: { settings: AppSettings; locale: AppLocale; copy: ReturnType<typeof copyFor>; onOpenPlan: () => void; deRiskYears?: number }) {
  const today = useMemo(() => new Date(), []);
  const target = settings.planTarget ?? { targetUseDate: settings.endDate ?? "", needFullAmount: true };
  const partialAmount = !target.needFullAmount && Number.isFinite(target.partialNeedEuro) && (target.partialNeedEuro ?? 0) > 0 ? target.partialNeedEuro ?? null : null;
  const targetAmount = target.needFullAmount ? null : partialAmount;
  const contribution = settings.contributionY2 > 0 ? settings.contributionY2 : settings.contributionY1 > 0 ? settings.contributionY1 : null;
  const yearsLeft = yearsTo(target.targetUseDate, today);
  const hasGoal = yearsLeft !== null && (target.needFullAmount || partialAmount !== null);
  const phase = hasGoal ? phaseFor(yearsLeft!, deRiskYears) : null;
  const [phaseName, phaseSentence] = phase ? copy.phase[phase] : ["", ""];
  const vwceShare = phase === "accumulate" ? 1 : phase === "transition" ? 0.5 : 0;
  const safeShare = phase === "use" ? 0 : 1 - vwceShare;
  const goalLabel = settings.planName || copy.plan;

  return <section className={`p40-plan ${phase ? `p40-plan-${phase}` : "p40-plan-empty"}`} aria-label={copy.plan}>
    <div className="p40-zone-head"><h2>{copy.plan}</h2><button type="button" className="p40-quiet-link" onClick={onOpenPlan}>{hasGoal ? copy.configurePlan : copy.addGoal}<IconChevronRight aria-hidden /></button></div>
    {!hasGoal ? <div className="p40-plan-empty-state"><span>{copy.planEmpty}</span><p>{copy.planEmptyCopy}</p><button type="button" className="p40-text-button" onClick={onOpenPlan}>{copy.addGoal}<IconChevronRight aria-hidden /></button></div> : <>
      <div className="p40-phase-line"><span className="p40-phase-chip">{phaseName} · {phase === "use" ? target.targetUseDate.slice(0, 4) : `${yearsLeft} ${locale === "de" ? "Jahre" : "năm"}`}</span></div>
      <div className="p40-goal"><span>{goalLabel}</span><strong>{target.needFullAmount ? copy.fullPortfolio : money(partialAmount ?? 0, locale)} <small>· {target.targetUseDate.slice(0, 4)}</small></strong></div>
      <div className="p40-annual"><span>{copy.annual}</span><p>{phaseSentence}</p>{contribution === null ? <strong className="p40-unknown">{copy.missingContribution}</strong> : phase === "use" ? <div className="p40-use-lines"><strong>{copy.useNeed}: {target.needFullAmount ? copy.fullPortfolio : money(partialAmount ?? 0, locale)}</strong><small>{copy.safeAvailable}: —</small></div> : <><strong>{money(contribution, locale)} → {money(contribution * vwceShare, locale)} {copy.vwce} · {money(contribution * safeShare, locale)} {copy.safe}</strong>{phase === "transition" ? <div className="p40-split" aria-label={`${copy.vwce} ${percent(vwceShare, locale)} · ${copy.safe} ${percent(safeShare, locale)}`}><i style={{ width: `${vwceShare * 100}%` }} /><b>{percent(vwceShare, locale)} {copy.vwce}</b><em>{percent(safeShare, locale)} {copy.safe}</em></div> : null}<small>{copy.transfer}: {phase === "accumulate" ? copy.noTransfer : copy.unavailable}</small></>}</div>
      <small className="p40-disclaimer">{copy.disclaimer}</small>
    </>}
  </section>;
}

function InlineAction({ title, onClick }: { title: string; onClick: () => void }) {
  return <button type="button" className="p40-inline-action" onClick={onClick}><span>{title}</span><IconChevronRight aria-hidden /></button>;
}

export default function SettingsCboWorkspace(props: Props) {
  const copy = copyFor(props.locale);
  const [sheet, setSheet] = useState<SettingsSheet>(null);
  const [deRiskYears, setDeRiskYears] = useState(5);
  const [transferRate, setTransferRate] = useState(12);
  const target = props.settings.planTarget ?? { targetUseDate: props.settings.endDate ?? "", needFullAmount: true };
  const today = useMemo(() => new Date(), []);
  const currentYear = today.getFullYear();
  const goalYear = /^\d{4}/.test(target.targetUseDate) ? Number(target.targetUseDate.slice(0, 4)) : currentYear;
  const themes: Array<{ value: ThemeChoice; label: string }> = props.locale === "de" ? [{ value: "premium", label: "Vault" }, { value: "dark", label: "Ozean" }, { value: "light", label: "Ember" }] : [{ value: "premium", label: "Vault" }, { value: "dark", label: "Ocean" }, { value: "light", label: "Ember" }];

  const editTarget = (patch: Partial<PlanTarget>) => props.onChangeTarget({ ...target, ...patch });
  const updateRate = (key: "vwceReturn" | "inflationRate" | "safeReturn" | "bufferPct", value: string) => { const parsed = parsePercent(value); if (parsed !== undefined) props.onPatchSettings({ [key]: parsed }); };
  const yearlyPlanRows = useMemo(() => buildYearlyPlanRows(props.settings, target, deRiskYears, currentYear), [props.settings, target, deRiskYears, currentYear]);

  return <div className="settings-cbo p40-settings">
    <header className="p40-header"><h1>{copy.title}</h1><div className="p40-identity"><span>{copy.fund}</span><strong>{props.settings.planName || "VWCE Vault"}{props.settings.childName ? ` · ${props.settings.childName}` : ""}</strong><small role="status">{props.saveLabel || copy.saved}</small></div></header>
    <div className="p40-tabs" role="tablist" aria-label={copy.title}>{(["general", "prices", "data"] as CboTab[]).map((tab) => <button key={tab} type="button" role="tab" aria-selected={props.activeTab === tab} onClick={() => props.onSelectTab(tab)}>{copy.tabs[tab]}</button>)}</div>

    {props.activeTab === "general" ? <div className="p40-panel" role="tabpanel">
      <section className="p40-profile-strip"><div><span>{copy.fund}</span><strong>{props.settings.planName || "VWCE Vault"}{props.settings.childName ? ` · ${props.settings.childName}` : ""}</strong></div><button type="button" onClick={() => setSheet("profile")}>{copy.editProfile}</button></section>
      <PlanSummary settings={props.settings} locale={props.locale} copy={copy} deRiskYears={deRiskYears} onOpenPlan={() => setSheet("plan")} />
      <section className="p40-zone p40-everyday"><div className="p40-zone-head"><h2>{copy.everyday}</h2></div><div className="p40-preference-grid"><div><span>{copy.language}</span><div className="p40-segments"><button type="button" className={props.locale === "vi" ? "selected" : ""} onClick={() => props.onLocale("vi")}>VI</button><button type="button" className={props.locale === "de" ? "selected" : ""} onClick={() => props.onLocale("de")}>DE</button></div></div><div><span>{copy.appearance}</span><div className="p40-segments">{themes.map((theme) => <button type="button" key={theme.value} className={props.theme === theme.value ? "selected" : ""} onClick={() => props.onTheme(theme.value)}>{theme.label}</button>)}</div></div></div><label className="p40-toggle-row"><span><strong>{copy.wallet}</strong><small>{copy.walletHelp}</small></span><input type="checkbox" checked={props.settings.trackInAppCash === true} onChange={(event) => props.onPatchSettings({ trackInAppCash: event.target.checked })} /></label></section>
      <section className="p40-zone p40-security"><div className="p40-zone-head"><h2>{copy.security}</h2></div><div className="p40-security-actions"><InlineAction title={copy.password} onClick={() => props.onOpenChild("password-change")} /><InlineAction title={copy.recovery} onClick={() => props.onOpenChild("password-reset")} /><InlineAction title={copy.mfa} onClick={() => props.onOpenChild("mfa")} /></div>{props.onSignOut ? <button type="button" className="p40-signout" onClick={props.onSignOut}>{copy.signOut}</button> : null}</section>
    </div> : null}

    {props.activeTab === "prices" ? <div className="p40-panel" role="tabpanel"><section className="p40-zone p40-price-zone"><div className="p40-zone-head"><div><h2>{copy.prices}</h2><p>{copy.pricesHelp}</p></div><button type="button" className="p40-quiet-link">{copy.pricesInfo}<IconChevronRight aria-hidden /></button></div>{props.pricesPanel}</section></div> : null}

    {props.activeTab === "data" ? <div className="p40-panel" role="tabpanel"><header className="p40-tab-intro"><h2>{copy.data}</h2></header><section className="p40-sync-zone"><div className="p40-zone-head"><div><h2>{copy.sync}</h2>{props.lastSync ? <p>{props.lastSync}</p> : null}</div></div><div className="p40-sync-health">{props.syncHealthPanel}</div><button type="button" className="p40-sync-button" disabled={props.syncing} onClick={props.onSync}><IconSync />{props.syncing ? props.syncLabel : copy.syncNow}</button>{props.syncConflictPanel}</section><section className="p40-zone"><div className="p40-zone-head"><h2>{copy.transfers}</h2></div><div className="p40-transfer-grid"><InlineAction title={copy.backup} onClick={() => props.onOpenChild("backup")} /><InlineAction title={copy.restore} onClick={() => props.onOpenChild("restore")} /><InlineAction title={copy.csv} onClick={props.onExportCsv} />{props.onOpenMigrate ? <InlineAction title={copy.device} onClick={props.onOpenMigrate} /> : null}</div>{props.handoffAction ? <div className="p40-handoff">{props.handoffAction}</div> : null}</section><section className="p40-detail-zone"><InlineAction title={copy.diagnostics} onClick={() => props.onOpenChild("diagnostics")} /><details><summary>{copy.localDetails}</summary>{props.dataHealthPanel}</details></section><section className="p40-danger-zone"><span>{copy.danger}</span>{props.dangerAction}</section></div> : null}

    {sheet === "profile" ? <Sheet title={copy.profile} closeLabel={copy.close} onClose={() => setSheet(null)}><div className="p40-sheet-fields"><label><span>{copy.planName}</span><input value={props.settings.planName} onChange={(event) => props.onPatchSettings({ planName: event.target.value })} /></label><label><span>{copy.childName}</span><input value={props.settings.childName} onChange={(event) => props.onPatchSettings({ childName: event.target.value })} /></label><div><span>{copy.account}</span><div className="p40-segments"><button type="button" className={props.settings.accountType === "parent" ? "selected" : ""} onClick={() => props.onPatchSettings({ accountType: "parent" })}>{copy.parent}</button><button type="button" className={props.settings.accountType === "child" ? "selected" : ""} onClick={() => props.onPatchSettings({ accountType: "child" })}>{copy.child}</button></div></div></div><button type="button" className="p40-sheet-done" onClick={() => setSheet(null)}>{copy.save}</button></Sheet> : null}
    {sheet === "plan" ? <Sheet title={copy.plan} closeLabel={copy.close} onClose={() => setSheet(null)}>
      <div className="p40-sheet-fields">
        <label><span>{copy.targetDate}</span><input type="date" value={target.targetUseDate} onChange={(event) => editTarget({ targetUseDate: event.target.value })} /></label>
        <label className="p40-toggle-row"><span><strong>{copy.fullAmount}</strong></span><input type="checkbox" checked={target.needFullAmount} onChange={(event) => editTarget({ needFullAmount: event.target.checked, partialNeedEuro: event.target.checked ? undefined : target.partialNeedEuro })} /></label>
        {!target.needFullAmount ? <label><span>{copy.targetAmount}</span><input inputMode="decimal" type="number" min="0" value={target.partialNeedEuro ?? ""} onChange={(event) => editTarget({ partialNeedEuro: parseNumber(event.target.value) })} /></label> : null}
        <div><span>{copy.safeWindow}</span><div className="p40-segments">{[3, 5, 7].map((value) => <button key={value} type="button" className={deRiskYears === value ? "selected" : ""} onClick={() => setDeRiskYears(value)}>{value} {props.locale === "de" ? "J." : "năm"}</button>)}</div></div>
        <label><span>{copy.transferRate}</span><select value={transferRate} onChange={(event) => setTransferRate(Number(event.target.value))}><option value={8}>8%</option><option value={12}>12%</option><option value={16}>16%</option></select></label>
      </div>
      <div className="p40-milestones"><div><span>{copy.milestones[0]}</span><strong>{currentYear}</strong></div><div><span>{copy.milestones[1]}</span><strong>{Math.max(currentYear, goalYear - deRiskYears)}</strong></div><div><span>{copy.milestones[2]}</span><strong>{goalYear}</strong></div></div>
      {(() => {
        const yearsLeftSheet = yearsTo(target.targetUseDate, today);
        const hasDate = yearsLeftSheet !== null;
        const hasAmount = target.needFullAmount || (Number.isFinite(target.partialNeedEuro) && (target.partialNeedEuro ?? 0) > 0);
        if (!hasDate || !hasAmount) {
          return <div className="p40-sheet-result" role="status"><span>{copy.resultTitle}</span><p>{copy.planEmptyCopy}</p></div>;
        }
        const phaseSheet = phaseFor(yearsLeftSheet!, deRiskYears);
        const [phaseNameSheet, phaseSentenceSheet] = copy.phase[phaseSheet];
        const safeStartYear = Math.max(currentYear, goalYear - deRiskYears);
        const vwceShareSheet = phaseSheet === "accumulate" ? 1 : phaseSheet === "transition" ? 0.5 : 0;
        const safeShareSheet = phaseSheet === "use" ? 0 : 1 - vwceShareSheet;
        const contributionSheet = props.settings.contributionY2 > 0 ? props.settings.contributionY2 : props.settings.contributionY1 > 0 ? props.settings.contributionY1 : null;
        const amountLabel = target.needFullAmount ? copy.fullPortfolio : money(target.partialNeedEuro ?? 0, props.locale);
        return <div className="p40-sheet-result" role="status">
          <span>{copy.resultTitle}</span>
          <strong>{phaseNameSheet} · {phaseSheet === "use" ? goalYear : `${yearsLeftSheet} ${props.locale === "de" ? "Jahre" : "năm"}`}</strong>
          <p>{phaseSentenceSheet}</p>
          <small>{copy.resultSafeStart}: <b>{safeStartYear}</b> · {copy.resultNeedYear}: <b>{goalYear}</b></small>
          {contributionSheet === null ? <small>{copy.missingContribution}</small> : phaseSheet === "use" ? <small>{copy.useNeed}: {amountLabel}</small> : <small>{copy.resultThisYear}: {money(contributionSheet, props.locale)} → {money(contributionSheet * vwceShareSheet, props.locale)} {copy.vwce} · {money(contributionSheet * safeShareSheet, props.locale)} {copy.safe}</small>}
          <small>{copy.transferPctYear}: {phaseSheet === "accumulate" ? copy.noTransfer : `${transferRate}%`} · {copy.disclaimer}</small>
        </div>;
      })()}
      {yearlyPlanRows.length > 0 ? <section aria-label={copy.yearPlanTitle} style={{ display: "grid", gap: 10 }}>
        <div>
          <strong style={{ display: "block", color: "var(--p40-ink)", fontSize: 17, letterSpacing: "-.02em" }}>{copy.yearPlanTitle}</strong>
          <small style={{ display: "block", marginTop: 4, color: "var(--p40-muted)", fontSize: 12, lineHeight: 1.4 }}>{copy.yearPlanSubtitle}</small>
        </div>
        <div style={{ overflowX: "auto", border: "1px solid var(--p40-line)", borderRadius: 16, background: "var(--p40-surface)" }}>
          <table data-testid="p40-yearly-plan" style={{ width: "100%", minWidth: 620, borderCollapse: "separate", borderSpacing: 0, fontVariantNumeric: "tabular-nums lining-nums" }}>
            <thead>
              <tr style={{ background: "var(--p40-surface-subtle)" }}>
                {["Năm", "Pha", "Góp/năm", copy.vwce, copy.safe].map((label, index) => <th key={label} scope="col" style={{ padding: "10px 12px", color: "var(--p40-muted)", fontSize: 10, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", textAlign: index >= 2 ? "right" : "left", borderBottom: "1px solid var(--p40-line)", whiteSpace: "nowrap" }}>{label}</th>)}
              </tr>
            </thead>
            <tbody>
              {yearlyPlanRows.map((row) => {
                const markerText = row.markers.map((marker) => marker === "current" ? copy.currentMarker : marker === "safe" ? copy.safeMarker : copy.goalMarker).join(" · ");
                const borderColor = row.markers.includes("goal") ? "var(--p40-safe)" : row.markers.includes("safe") ? "var(--p40-caution)" : row.markers.includes("current") ? "var(--p40-teal)" : "transparent";
                const valueStyle = { padding: "11px 12px", fontSize: 13, color: "var(--p40-ink)", borderBottom: "1px solid var(--p40-line)", verticalAlign: "top" } as const;
                return <tr key={row.year} style={{ background: row.markers.length ? "color-mix(in srgb, var(--p40-teal-soft) 36%, var(--p40-surface))" : "transparent" }}>
                  <td style={{ ...valueStyle, borderLeft: `3px solid ${borderColor}` }}><strong style={{ fontSize: 16 }}>{row.year}</strong>{markerText ? <small style={{ display: "block", marginTop: 3, color: "var(--p40-muted)", fontSize: 10, lineHeight: 1.25 }}>{markerText}</small> : null}</td>
                  <td style={valueStyle}><span style={{ fontWeight: 700 }}>{copy.phase[row.phase][0]}</span><small style={{ display: "block", marginTop: 2, color: "var(--p40-muted)", fontSize: 10 }}>{row.months} {props.locale === "de" ? "Mon." : "tháng"}</small></td>
                  <td style={{ ...valueStyle, textAlign: "right", whiteSpace: "nowrap" }}><strong>{row.annual === null ? "—" : money(row.annual, props.locale)}</strong></td>
                  <td style={{ ...valueStyle, textAlign: "right", whiteSpace: "nowrap" }}>{row.vwce === null ? "—" : money(row.vwce, props.locale)}</td>
                  <td style={{ ...valueStyle, textAlign: "right", whiteSpace: "nowrap" }}>{row.safe === null ? "—" : money(row.safe, props.locale)}</td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      </section> : null}
      <button type="button" className="p40-advanced-link" onClick={() => setSheet("simulation")}>{copy.advanced}<small>{copy.advancedHelp}</small><IconChevronRight aria-hidden /></button>
      <button type="button" className="p40-sheet-done" onClick={() => setSheet(null)}>{copy.save}</button>
    </Sheet> : null}
    {sheet === "simulation" ? <Sheet title={copy.simulation} closeLabel={copy.close} onClose={() => setSheet("plan")}><p className="p40-sheet-note">{copy.simulationNote}</p><div className="p40-sheet-fields p40-percent-grid"><label><span>{copy.vwceReturn}</span><input inputMode="decimal" value={String(props.settings.vwceReturn * 100)} onChange={(event) => updateRate("vwceReturn", event.target.value)} /><small>{copy.perYear}</small></label><label><span>{copy.inflation}</span><input inputMode="decimal" value={String(props.settings.inflationRate * 100)} onChange={(event) => updateRate("inflationRate", event.target.value)} /><small>{copy.perYear}</small></label><label><span>{copy.safeReturn}</span><input inputMode="decimal" value={String(props.settings.safeReturn * 100)} onChange={(event) => updateRate("safeReturn", event.target.value)} /><small>{copy.perYear}</small></label><label><span>{copy.buffer}</span><input inputMode="decimal" value={String(props.settings.bufferPct * 100)} onChange={(event) => updateRate("bufferPct", event.target.value)} /><small>%</small></label></div><button type="button" className="p40-sheet-done" onClick={() => setSheet("plan")}>{copy.save}</button></Sheet> : null}
  </div>;
}
