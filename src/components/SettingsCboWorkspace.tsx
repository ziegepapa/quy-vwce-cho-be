import { useMemo, useState, type ReactNode } from "react";
import type { AppLocale } from "../lib/locale";
import type { AppSettings, PlanTarget } from "../lib/types";
import type { ThemeChoice } from "../lib/theme";
import {
  IconArchive,
  IconChevronRight,
  IconDownload,
  IconLanguage,
  IconLock,
  IconSettings,
  IconShield,
  IconSliders,
  IconSync,
  IconUpload,
  IconUser,
} from "./Icons";
import "../styles/settings-cbo.css";

type CboTab = "general" | "prices" | "data";
type ChildAction = "password-change" | "password-reset" | "mfa" | "diagnostics" | "backup" | "restore";

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
  operationsExtra?: ReactNode;
};

type Copy = {
  screenTitle: string;
  screenSubtitle: string;
  saved: string;
  tabs: Record<CboTab, string>;
  identity: string;
  identityHelp: string;
  planName: string;
  childName: string;
  accountType: string;
  parent: string;
  child: string;
  horizon: string;
  horizonHelp: string;
  goalDate: string;
  fullAmount: string;
  targetAmount: string;
  window: string;
  timeline: string;
  scenario: string;
  scenarioHelp: string;
  viewSimulation: string;
  missingGoal: string;
  missingGoalHelp: string;
  contribution: string;
  vwce: string;
  safe: string;
  transfer: string;
  transferUnavailable: string;
  disclaimer: string;
  simulation: string;
  simulationHelp: string;
  vwceReturn: string;
  inflation: string;
  safeReturn: string;
  buffer: string;
  cash: string;
  cashHelp: string;
  preferences: string;
  appearance: string;
  language: string;
  security: string;
  securityHelp: string;
  changePassword: string;
  passwordSub: string;
  resetPassword: string;
  resetSub: string;
  mfa: string;
  mfaSub: string;
  pricesTitle: string;
  pricesHelp: string;
  dataTitle: string;
  dataHelp: string;
  sync: string;
  syncHelp: string;
  syncNow: string;
  diagnostics: string;
  diagnosticsSub: string;
  backup: string;
  backupSub: string;
  restore: string;
  restoreSub: string;
  csv: string;
  csvSub: string;
  deviceRecovery: string;
  deviceRecoverySub: string;
  signOut: string;
  phase: Record<"accumulate" | "transition" | "protect" | "use", { label: string; copy: string }>;
};

function copyFor(locale: AppLocale): Copy {
  if (locale === "de") {
    return {
      screenTitle: "Einstellungen", screenSubtitle: "Familienplan, Daten und Schutz an einem klaren Ort.", saved: "Auf diesem Gerät gespeichert",
      tabs: { general: "Allgemein", prices: "Kurse", data: "Daten" },
      identity: "Familienprofil", identityHelp: "Namen und Kontoinhaberschaft beschreiben den Vault; sie ändern keine Buchungen.", planName: "Name des Plans", childName: "Name des Kindes", accountType: "Konto läuft auf", parent: "Eltern", child: "Kind",
      horizon: "Horizon & Sicherheit", horizonHelp: "Eine Jahresansicht aus Ihrem Zieltermin und bestätigten Eingaben. Keine Transaktion wird verändert.", goalDate: "Verwendungsdatum", fullAmount: "Nahezu gesamtes Vermögen wird verwendet", targetAmount: "Zielbetrag (EUR)", window: "Beispielhafter Sicherheitszeitraum: 5 Jahre", timeline: "Zeitleiste", scenario: "Szenario für dieses Jahr", scenarioHelp: "Vorschau anhand des Zieltermins und der Eingaben; keine Kauf-, Verkaufs- oder Umbuchungsanweisung.", viewSimulation: "In Simulation ansehen", missingGoal: "Zielbetrag noch nicht konfiguriert", missingGoalHelp: "Hinterlegen Sie Zieltermin, Teilbetrag und Sparrate, damit Beträge nachvollziehbar angezeigt werden.", contribution: "Konfigurierte Sparrate", vwce: "VWCE im Szenario", safe: "Sicherer Anteil im Szenario", transfer: "Umschichtungs-Vorschau", transferUnavailable: "Nicht verfügbar – kein bestätigter VWCE-Wert", disclaimer: "Vorschau zum Zieltermin. Bereits erfasste Transaktionen bleiben unverändert.",
      simulation: "Annahmen für Ziel & Simulation", simulationHelp: "Diese Werte beeinflussen nur Ziel- und Simulationsansichten, nie bereits erfasste Transaktionen.", vwceReturn: "VWCE-Rendite p.a.", inflation: "Inflation p.a.", safeReturn: "Sicherer Anteil p.a.", buffer: "Sicherheitsbuffer", cash: "Cash-Modell in der App", cashHelp: "Die bestehende Buchungslogik für Einzahlungen vor Käufen bleibt unverändert.", preferences: "Darstellung & Sprache", appearance: "Erscheinungsbild", language: "Sprache", security: "Konto & Sicherheit", securityHelp: "Passwort, Wiederherstellung und MFA bleiben in eigenen sicheren Schritten.", changePassword: "Passwort ändern", passwordSub: "Sicheren Link anfordern", resetPassword: "Passwort zurücksetzen", resetSub: "Neuen Wiederherstellungslink senden", mfa: "MFA / TOTP", mfaSub: "Kontoschutz einrichten oder prüfen",
      pricesTitle: "Kurse", pricesHelp: "Feed-Status, wirksame Preise und manuelle Korrekturen bleiben explizit und reversibel.", dataTitle: "Daten & Betrieb", dataHelp: "Lokaler Zustand, Sicherungen und Synchronisierung bleiben owner-gesteuert.", sync: "Synchronisierung", syncHelp: "Status, Konflikte und Diagnose dieses Geräts.", syncNow: "Jetzt synchronisieren", diagnostics: "Gerätediagnose", diagnosticsSub: "Status und lokale Diagnose öffnen", backup: "Datensicherung", backupSub: "JSON-Sicherung exportieren", restore: "Daten wiederherstellen", restoreSub: "JSON-Sicherung mit bestehenden Schutzschritten importieren", csv: "Transaktionen als CSV", csvSub: "Datentabelle für eigene Analysen exportieren", deviceRecovery: "Gerätedaten wiederherstellen", deviceRecoverySub: "Bestehenden Wiederherstellungsablauf öffnen", signOut: "Abmelden",
      phase: {
        accumulate: { label: "Aufbau", copy: "Noch weit bis zum Zieltermin – dies ist ein Aufbau-Szenario." },
        transition: { label: "Übergang", copy: "Der Zieltermin liegt im Sicherheitszeitraum – dies ist eine Vorschau auf neue Beiträge." },
        protect: { label: "Schutz", copy: "Der Zieltermin rückt näher – prüfen Sie die bestätigten Zielwerte." },
        use: { label: "Verwenden", copy: "Das Zieljahr ist erreicht – prüfen Sie Bedarf und bestätigte Mittel." },
      },
    };
  }
  return {
    screenTitle: "Cài đặt", screenSubtitle: "Kế hoạch gia đình, dữ liệu và bảo vệ ở một nơi rõ ràng.", saved: "Đã lưu trên thiết bị này",
    tabs: { general: "Chung", prices: "Giá", data: "Dữ liệu" },
    identity: "Hồ sơ gia đình", identityHelp: "Tên và người đứng tên mô tả Vault; không thay đổi giao dịch đã ghi.", planName: "Tên kế hoạch", childName: "Tên bé", accountType: "Tài khoản đứng tên", parent: "Cha/mẹ", child: "Bé",
    horizon: "Horizon & an toàn", horizonHelp: "Góc nhìn theo năm từ mốc mục tiêu và input đã xác nhận. Không thay đổi giao dịch.", goalDate: "Mốc sử dụng tiền", fullAmount: "Dùng gần như toàn bộ danh mục", targetAmount: "Số tiền mục tiêu (EUR)", window: "Cửa sổ an toàn minh họa: 5 năm", timeline: "Timeline", scenario: "Kịch bản năm nay", scenarioHelp: "Preview theo mốc mục tiêu và input bạn chọn; không phải lệnh mua, bán hoặc chuyển tiền.", viewSimulation: "Xem trên Mô phỏng", missingGoal: "Chưa cấu hình số tiền mục tiêu", missingGoalHelp: "Nhập mốc, số tiền cần dùng và mức góp để ứng dụng hiển thị euro có thể đối chiếu.", contribution: "Mức góp đã cấu hình", vwce: "VWCE trong kịch bản", safe: "Phần an toàn trong kịch bản", transfer: "Preview chuyển đổi", transferUnavailable: "Chưa có – không có giá trị VWCE đã xác nhận", disclaimer: "Preview theo mốc mục tiêu. Giao dịch đã ghi không bị thay đổi.",
    simulation: "Giả định cho mục tiêu & mô phỏng", simulationHelp: "Các giá trị này chỉ dùng cho mục tiêu và mô phỏng, không thay đổi giao dịch đã ghi.", vwceReturn: "Lợi suất VWCE/năm", inflation: "Lạm phát/năm", safeReturn: "Phần an toàn/năm", buffer: "Biên an toàn", cash: "Ví trong app", cashHelp: "Giữ nguyên logic ghi nhận tiền nạp trước lệnh mua hiện có.", preferences: "Giao diện & ngôn ngữ", appearance: "Giao diện", language: "Ngôn ngữ", security: "Tài khoản & bảo mật", securityHelp: "Mật khẩu, khôi phục và MFA vẫn đi qua các bước bảo mật riêng.", changePassword: "Đổi mật khẩu", passwordSub: "Yêu cầu link an toàn", resetPassword: "Gửi lại link đặt mật khẩu", resetSub: "Gửi link khôi phục mới", mfa: "MFA / TOTP", mfaSub: "Thiết lập hoặc kiểm tra bảo vệ tài khoản",
    pricesTitle: "Giá", pricesHelp: "Trạng thái feed, giá đang dùng và chỉnh tay vẫn rõ ràng, có thể hủy.", dataTitle: "Dữ liệu & vận hành", dataHelp: "Trạng thái local, sao lưu và đồng bộ luôn do owner kiểm soát.", sync: "Đồng bộ", syncHelp: "Trạng thái, xung đột và chẩn đoán trên thiết bị.", syncNow: "Đồng bộ ngay", diagnostics: "Chẩn đoán thiết bị", diagnosticsSub: "Mở trạng thái và chẩn đoán local", backup: "Sao lưu dữ liệu", backupSub: "Xuất bản sao JSON", restore: "Khôi phục dữ liệu", restoreSub: "Nhập JSON với các bước bảo vệ hiện có", csv: "Xuất giao dịch CSV", csvSub: "Xuất bảng dữ liệu để tự phân tích", deviceRecovery: "Khôi phục dữ liệu trên thiết bị", deviceRecoverySub: "Mở luồng khôi phục sẵn có", signOut: "Đăng xuất",
    phase: {
      accumulate: { label: "Tích lũy", copy: "Còn xa hạn — đây là kịch bản tích lũy theo mốc đã chọn." },
      transition: { label: "Chuyển dần", copy: "Đã vào cửa sổ an toàn — preview này chỉ tách khoản góp mới theo ví dụ." },
      protect: { label: "Bảo vệ", copy: "Gần hạn — kiểm tra phần an toàn và số tiền mục tiêu đã xác nhận." },
      use: { label: "Dùng tiền", copy: "Đã đến năm cần tiền — đối chiếu khoản cần dùng với nguồn tiền đã xác nhận." },
    },
  };
}

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

function yearsTo(targetDate: string, today: Date): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) return null;
  const target = new Date(`${targetDate}T12:00:00`);
  if (!Number.isFinite(target.getTime())) return null;
  return Math.max(0, target.getFullYear() - today.getFullYear());
}

function scenarioFor(yearsLeft: number): { kind: "accumulate" | "transition" | "protect" | "use"; vwceShare: number; safeShare: number } {
  if (yearsLeft > 5) return { kind: "accumulate", vwceShare: 1, safeShare: 0 };
  if (yearsLeft > 2) return { kind: "transition", vwceShare: 0.5, safeShare: 0.5 };
  if (yearsLeft > 0) return { kind: "protect", vwceShare: 0, safeShare: 1 };
  return { kind: "use", vwceShare: 0, safeShare: 1 };
}

function SectionCard({ eyebrow, title, help, children, tone = "neutral" }: { eyebrow?: string; title: string; help?: string; children: ReactNode; tone?: "neutral" | "horizon" | "security" | "data" }) {
  return <section className={`cbo-section cbo-section-${tone}`}><header>{eyebrow ? <span className="cbo-eyebrow">{eyebrow}</span> : null}<h2>{title}</h2>{help ? <p>{help}</p> : null}</header>{children}</section>;
}

function ActionRow({ icon, title, subtitle, onClick, danger = false }: { icon: ReactNode; title: string; subtitle: string; onClick: () => void; danger?: boolean }) {
  return <button type="button" className={`cbo-action-row${danger ? " danger" : ""}`} onClick={onClick}><span className="cbo-action-icon" aria-hidden>{icon}</span><span><strong>{title}</strong><small>{subtitle}</small></span><IconChevronRight aria-hidden /></button>;
}

type HorizonPhase = "accumulate" | "transition" | "protect" | "use";

type HorizonPreview = {
  phase: HorizonPhase;
  vwceShare: number;
  safeShare: number;
  transferPct: number;
  vwceValue: number;
};

function previewFor(year: number, goalYear: number, deRiskYears: number, transferPct: number, sample: boolean): HorizonPreview {
  const yearsLeft = Math.max(0, goalYear - year);
  if (yearsLeft > deRiskYears) return { phase: "accumulate", vwceShare: 1, safeShare: 0, transferPct: 0, vwceValue: sample ? 18000 : 0 };
  if (yearsLeft > 2) return { phase: "transition", vwceShare: 0.5, safeShare: 0.5, transferPct, vwceValue: sample ? 28000 : 0 };
  if (yearsLeft > 0) return { phase: "protect", vwceShare: 0, safeShare: 1, transferPct: 0, vwceValue: sample ? 28000 : 0 };
  return { phase: "use", vwceShare: 0, safeShare: 0, transferPct: 0, vwceValue: sample ? 28000 : 0 };
}

function HorizonCard({ settings, locale, copy, onChangeTarget }: { settings: AppSettings; locale: AppLocale; copy: Copy; onChangeTarget: (next: PlanTarget) => void }) {
  const target = settings.planTarget ?? { targetUseDate: settings.endDate ?? "", needFullAmount: true };
  const today = useMemo(() => new Date(), []);
  const currentYear = today.getFullYear();
  const parsedYears = yearsTo(target.targetUseDate, today);
  const configuredTarget = !target.needFullAmount && Number.isFinite(target.partialNeedEuro) && (target.partialNeedEuro ?? 0) > 0 ? target.partialNeedEuro ?? null : null;
  const configuredContribution = settings.contributionY2 > 0 ? settings.contributionY2 : settings.contributionY1 > 0 ? settings.contributionY1 : null;
  const isIllustrative = parsedYears === null || configuredTarget === null || configuredContribution === null;
  const goalYear = isIllustrative ? 2036 : currentYear + (parsedYears ?? 10);
  const goalAmount = isIllustrative ? 50000 : configuredTarget ?? 50000;
  const contribution = isIllustrative ? 300 : configuredContribution ?? 300;
  const [deRiskYears, setDeRiskYears] = useState(5);
  const [transferPct, setTransferPct] = useState(12);
  const [preview, setPreview] = useState<"now" | "near">("now");
  const activeScenario = previewFor(currentYear, goalYear, deRiskYears, transferPct / 100, isIllustrative);
  const nearYear = Math.max(currentYear, goalYear - 4);
  const previewYear = preview === "near" ? nearYear : currentYear;
  const annualScenario = previewFor(previewYear, goalYear, deRiskYears, transferPct / 100, isIllustrative);
  const annualPhase = copy.phase[annualScenario.phase];
  const transferEuro = annualScenario.vwceValue > 0 ? annualScenario.vwceValue * annualScenario.transferPct : null;
  const yearsLeft = Math.max(0, goalYear - currentYear);
  const safetyStart = Math.max(currentYear, goalYear - deRiskYears);
  const labels = locale === "de" ? {
    mock: "Beispiel, keine Vault-Daten", target: "Ziel", safeMoney: "Sicherer Teil", perMonth: "/Monat", now: "In diesem Jahr", near: "Näher am Ziel (Beispiel)", annual: "In diesem Jahr", options: "Horizon anpassen", optionsHelp: "Ziel, Zeitraum und Berechnung anzeigen", chooseWindow: "Sicherheitszeitraum", transferRate: "Transfer-Vorschau/Jahr", today: "Heute", safetyStart: "Sicherheit beginnt", targetYear: "Zieljahr", formula: "So wird die Vorschau gezeigt", noTrade: "Nur Anzeige · keine Transaktion wird ausgelöst.", noTransfer: "Nicht nötig", noSource: "Nicht verfügbar – kein bestätigter VWCE-Wert", years: "Jahre", amount: "Betrag", statusMock: "Beispiel", current: "Aktuell",
  } : {
    mock: "Mẫu minh họa, không phải dữ liệu Quỹ", target: "Mục tiêu", safeMoney: "Phần an toàn", perMonth: "/tháng", now: "Năm nay", near: "Gần hạn (ví dụ)", annual: "Năm nay", options: "Tùy chỉnh Horizon", optionsHelp: "Mốc, cửa sổ an toàn và cách tính", chooseWindow: "Cửa sổ an toàn", transferRate: "Preview chuyển đổi/năm", today: "Hôm nay", safetyStart: "Bắt đầu an toàn", targetYear: "Năm cần tiền", formula: "Cách hiển thị preview", noTrade: "Chỉ hiển thị · không tạo giao dịch.", noTransfer: "Không cần", noSource: "Chưa có – không có giá trị VWCE đã xác nhận", years: "năm", amount: "Số tiền", statusMock: "Minh họa", current: "Hiện tại",
  };
  const statusLabel = `${isIllustrative ? labels.statusMock : labels.target} · ${money(goalAmount, locale)} · ${goalYear} · ${yearsLeft} ${labels.years} · ${copy.phase[activeScenario.phase].label}`;

  return <SectionCard title={copy.horizon} help={copy.horizonHelp} tone="horizon">
    <div className="cbo-horizon-status" role="status"><span>{statusLabel}</span>{isIllustrative ? <small>{labels.mock}</small> : null}</div>

    <article className={`cbo-annual-answer cbo-scenario-${annualScenario.phase}`} data-horizon-phase={annualScenario.phase}>
      <header><div><span className="cbo-eyebrow">{labels.annual}</span><h3>{preview === "near" ? `${labels.near} · ${previewYear}` : `${labels.now} · ${currentYear}`}</h3></div><span className="cbo-phase-badge">{annualPhase.label}</span></header>
      <p>{annualPhase.copy}</p>
      <div className="cbo-money-pairs">
        <div><span>{copy.vwce}</span><strong>{percent(annualScenario.vwceShare, locale)}</strong><small>{money(contribution * annualScenario.vwceShare, locale)}{labels.perMonth}</small></div>
        <div><span>{copy.safe}</span><strong>{percent(annualScenario.safeShare, locale)}</strong><small>{money(contribution * annualScenario.safeShare, locale)}{labels.perMonth}</small></div>
      </div>
      <div className="cbo-transfer"><span>{copy.transfer}</span><strong>{annualScenario.phase === "transition" && transferEuro !== null ? `${percent(annualScenario.transferPct, locale)} · ${money(transferEuro, locale)}` : annualScenario.phase === "accumulate" ? labels.noTransfer : labels.noSource}</strong></div>
      <div className="cbo-answer-actions"><button type="button" className={preview === "now" ? "selected" : ""} onClick={() => setPreview("now")}>{labels.now}</button><button type="button" className={preview === "near" ? "selected" : ""} onClick={() => setPreview("near")}>{labels.near}</button></div>
      <button type="button" className="cbo-secondary" onClick={() => { window.location.hash = "#/simulation"; }}>{copy.viewSimulation}<IconChevronRight aria-hidden /></button>
      <small className="cbo-disclaimer">{copy.disclaimer} {labels.noTrade}</small>
    </article>

    <details className="cbo-horizon-options">
      <summary><span><strong>{labels.options}</strong><small>{labels.optionsHelp}</small></span><IconChevronRight aria-hidden /></summary>
      <div className="cbo-horizon-options-body">
        <div className="cbo-horizon-summary">
          <label className="cbo-field"><span>{copy.goalDate}</span><input type="date" value={target.targetUseDate} onChange={(event) => onChangeTarget({ ...target, targetUseDate: event.target.value })} /></label>
          <label className="cbo-toggle"><input type="checkbox" checked={target.needFullAmount} onChange={(event) => onChangeTarget({ ...target, needFullAmount: event.target.checked, partialNeedEuro: event.target.checked ? undefined : target.partialNeedEuro })} /><span>{copy.fullAmount}</span></label>
          {!target.needFullAmount ? <label className="cbo-field"><span>{copy.targetAmount}</span><input inputMode="decimal" type="number" min="0" value={target.partialNeedEuro ?? ""} onChange={(event) => onChangeTarget({ ...target, partialNeedEuro: parseNumber(event.target.value) })} /></label> : null}
        </div>
        <div className="cbo-preview-controls" aria-label={labels.options}>
          <span>{labels.chooseWindow}</span><div role="group">{[3, 5, 7].map((value) => <button type="button" key={value} className={deRiskYears === value ? "selected" : ""} onClick={() => setDeRiskYears(value)}>{value} {labels.years}</button>)}</div>
          <label><span>{labels.transferRate}</span><select value={transferPct} onChange={(event) => setTransferPct(Number(event.target.value))}><option value={8}>8%</option><option value={12}>12%</option><option value={16}>16%</option></select></label>
        </div>
        <div className="cbo-horizon-milestones" aria-label={copy.horizon}><div><span>{labels.today}</span><strong>{currentYear}</strong><small>{copy.phase[activeScenario.phase].label}</small></div><div><span>{labels.safetyStart}</span><strong>{safetyStart}</strong><small>{copy.phase.transition.label}</small></div><div><span>{labels.targetYear}</span><strong>{goalYear}</strong><small>{copy.phase.use.label}</small></div></div>
        <dl className="cbo-formula"><dt>{labels.formula}</dt><dd>€ VWCE góp = {money(contribution, locale)} × {percent(annualScenario.vwceShare, locale)}</dd><dd>€ an toàn góp = {money(contribution, locale)} − € VWCE góp</dd><dd>€ chuyển = giá trị VWCE × {percent(annualScenario.transferPct, locale)}</dd></dl>
      </div>
    </details>
  </SectionCard>;
}

export default function SettingsCboWorkspace(props: Props) {
  const copy = copyFor(props.locale);
  const target = props.settings.planTarget ?? { targetUseDate: props.settings.endDate ?? "", needFullAmount: true };
  const themes: Array<{ value: ThemeChoice; label: string }> = props.locale === "de"
    ? [{ value: "premium", label: "Vault" }, { value: "dark", label: "Ozean" }, { value: "light", label: "Ember" }]
    : [{ value: "premium", label: "Vault" }, { value: "dark", label: "Ocean" }, { value: "light", label: "Ember" }];

  return <div className="settings-cbo">
    <header className="cbo-header"><div><h1>{copy.screenTitle}</h1><p>{props.settings.planName || copy.screenSubtitle}{props.settings.childName ? ` · ${props.settings.childName}` : ""}</p></div><span className="cbo-save" role="status">{props.saveLabel || copy.saved}</span></header>
    <div className="cbo-tabs" role="tablist" aria-label={copy.screenTitle}>{(["general", "prices", "data"] as CboTab[]).map((tab) => <button key={tab} type="button" role="tab" aria-selected={props.activeTab === tab} className={props.activeTab === tab ? "selected" : ""} onClick={() => props.onSelectTab(tab)}>{copy.tabs[tab]}</button>)}</div>

    {props.activeTab === "general" ? <div className="cbo-tab-panel" role="tabpanel">
      <SectionCard title={copy.identity} help={copy.identityHelp}>
        <div className="cbo-field-grid"><label className="cbo-field"><span>{copy.planName}</span><input value={props.settings.planName} onChange={(event) => props.onPatchSettings({ planName: event.target.value })} /></label><label className="cbo-field"><span>{copy.childName}</span><input value={props.settings.childName} onChange={(event) => props.onPatchSettings({ childName: event.target.value })} /></label></div>
        <div className="cbo-choice-group"><span>{copy.accountType}</span><div role="group"><button type="button" className={props.settings.accountType === "parent" ? "selected" : ""} onClick={() => props.onPatchSettings({ accountType: "parent" })}>{copy.parent}</button><button type="button" className={props.settings.accountType === "child" ? "selected" : ""} onClick={() => props.onPatchSettings({ accountType: "child" })}>{copy.child}</button></div></div>
      </SectionCard>
      <HorizonCard settings={props.settings} locale={props.locale} copy={copy} onChangeTarget={props.onChangeTarget} />
      <SectionCard title={copy.simulation} help={copy.simulationHelp}>
        <div className="cbo-field-grid cbo-rate-grid"><label className="cbo-field"><span>{copy.vwceReturn}</span><input inputMode="decimal" type="number" step="0.001" value={props.settings.vwceReturn} onChange={(event) => { const next = parseNumber(event.target.value); if (next !== undefined) props.onPatchSettings({ vwceReturn: next }); }} /></label><label className="cbo-field"><span>{copy.inflation}</span><input inputMode="decimal" type="number" step="0.001" value={props.settings.inflationRate} onChange={(event) => { const next = parseNumber(event.target.value); if (next !== undefined) props.onPatchSettings({ inflationRate: next }); }} /></label><label className="cbo-field"><span>{copy.safeReturn}</span><input inputMode="decimal" type="number" step="0.001" value={props.settings.safeReturn} onChange={(event) => { const next = parseNumber(event.target.value); if (next !== undefined) props.onPatchSettings({ safeReturn: next }); }} /></label><label className="cbo-field"><span>{copy.buffer}</span><input inputMode="decimal" type="number" step="0.001" value={props.settings.bufferPct} onChange={(event) => { const next = parseNumber(event.target.value); if (next !== undefined) props.onPatchSettings({ bufferPct: next }); }} /></label></div>
      </SectionCard>
      <SectionCard title={copy.cash} help={copy.cashHelp}><label className="cbo-toggle"><input type="checkbox" checked={props.settings.trackInAppCash === true} onChange={(event) => props.onPatchSettings({ trackInAppCash: event.target.checked })} /><span>{copy.cash}</span></label></SectionCard>
      <SectionCard title={copy.preferences}>
        <div className="cbo-preference"><span className="cbo-preference-icon"><IconSettings /></span><div><strong>{copy.appearance}</strong><div className="cbo-choice-buttons">{themes.map((theme) => <button type="button" key={theme.value} className={props.theme === theme.value ? "selected" : ""} onClick={() => props.onTheme(theme.value)}>{theme.label}</button>)}</div></div></div>
        <div className="cbo-preference"><span className="cbo-preference-icon"><IconLanguage /></span><div><strong>{copy.language}</strong><div className="cbo-choice-buttons"><button type="button" className={props.locale === "vi" ? "selected" : ""} onClick={() => props.onLocale("vi")}>{props.locale === "de" ? "Vietnamesisch" : "Tiếng Việt"}</button><button type="button" className={props.locale === "de" ? "selected" : ""} onClick={() => props.onLocale("de")}>Deutsch</button></div></div></div>
      </SectionCard>
      <SectionCard title={copy.security} help={copy.securityHelp} tone="security"><div className="cbo-actions"><ActionRow icon={<IconLock />} title={copy.changePassword} subtitle={copy.passwordSub} onClick={() => props.onOpenChild("password-change")} /><ActionRow icon={<IconLock />} title={copy.resetPassword} subtitle={copy.resetSub} onClick={() => props.onOpenChild("password-reset")} /><ActionRow icon={<IconShield />} title={copy.mfa} subtitle={copy.mfaSub} onClick={() => props.onOpenChild("mfa")} /></div></SectionCard>
    </div> : null}

    {props.activeTab === "prices" ? <div className="cbo-tab-panel" role="tabpanel"><SectionCard title={copy.pricesTitle} help={copy.pricesHelp}>{props.pricesPanel}</SectionCard></div> : null}

    {props.activeTab === "data" ? <div className="cbo-tab-panel" role="tabpanel">
      <SectionCard title={copy.dataTitle} help={copy.dataHelp} tone="data">{props.dataHealthPanel}</SectionCard>
      <SectionCard title={copy.sync} help={copy.syncHelp} tone="data"><div className="cbo-sync-summary">{props.syncHealthPanel}<button type="button" className="cbo-primary" disabled={props.syncing} onClick={props.onSync}><IconSync />{props.syncing ? props.syncLabel : copy.syncNow}</button>{props.lastSync ? <small>{props.lastSync}</small> : null}</div>{props.syncConflictPanel}<div className="cbo-actions"><ActionRow icon={<IconSliders />} title={copy.diagnostics} subtitle={copy.diagnosticsSub} onClick={() => props.onOpenChild("diagnostics")} /></div></SectionCard>
      <SectionCard title={copy.dataTitle} tone="data"><div className="cbo-actions"><ActionRow icon={<IconArchive />} title={copy.backup} subtitle={copy.backupSub} onClick={() => props.onOpenChild("backup")} /><ActionRow icon={<IconUpload />} title={copy.restore} subtitle={copy.restoreSub} onClick={() => props.onOpenChild("restore")} /><ActionRow icon={<IconDownload />} title={copy.csv} subtitle={copy.csvSub} onClick={props.onExportCsv} />{props.onOpenMigrate ? <ActionRow icon={<IconUser />} title={copy.deviceRecovery} subtitle={copy.deviceRecoverySub} onClick={props.onOpenMigrate} /> : null}{props.operationsExtra}{props.onSignOut ? <ActionRow icon={<IconLock />} title={copy.signOut} subtitle="" onClick={props.onSignOut} danger /> : null}</div></SectionCard>
    </div> : null}
  </div>;
}
