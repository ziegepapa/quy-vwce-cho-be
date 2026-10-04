import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { AppLocale } from "../lib/locale";
import type { AppSettings, PlanTarget } from "../lib/types";
import type { ThemeChoice } from "../lib/theme";
import { IconArchive, IconCash, IconChevronRight, IconClose, IconGoal, IconLanguage, IconLock, IconShield, IconSim, IconSliders, IconSync, IconUpload } from "./Icons";
import "../styles/settings-cbo.css";
import "../styles/settings-v2.css";

const CONTRIBUTION_PRESETS = [100, 120, 150, 200, 300] as const;

type CboTab = "general" | "prices" | "data";
type ChildAction = "password-change" | "password-reset" | "mfa" | "diagnostics" | "backup" | "restore";
type SettingsSheet = "profile" | "plan" | "simulation" | "theme" | "language" | "prices" | "sync" | "transfers" | null;
type HorizonPhase = "accumulate" | "transition" | "protect" | "use";
type ContribInsightTone = "neutral" | "ok" | "caution" | "warn";
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
  onPatchSettings: (next: Partial<AppSettings>) => void;
  onChangeTarget: (next: PlanTarget) => void;
  onTheme: (next: ThemeChoice) => void;
  onLocale: (next: AppLocale) => void;
  onOpenChild: (action: ChildAction) => void;
  onSync: () => void;
  onExportCsv: () => void;
  onOpenMigrate?: () => void;
  onSignOut?: () => void;
  mfaEnrolled?: boolean;
  lastSyncAt?: string | null;
  appVersion?: string;
  handoffAction?: ReactNode;
  dangerAction?: ReactNode;
};

function money(value: number, locale: AppLocale): string {
  return new Intl.NumberFormat(locale === "de" ? "de-DE" : "vi-VN", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
}

function percent(value: number, locale: AppLocale): string {
  return new Intl.NumberFormat(locale === "de" ? "de-DE" : "vi-VN", { style: "percent", maximumFractionDigits: 0 }).format(value);
}

function formatPlainYears(value: number, locale: AppLocale): string {
  return new Intl.NumberFormat(locale === "de" ? "de-DE" : "vi-VN", { maximumFractionDigits: 1, minimumFractionDigits: 0 }).format(value);
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

function buildContributionInsight(
  monthly: number | undefined,
  partialEuro: number | null,
  yearsLeft: number | null,
  messages: { pureOnly: string; exceedsAnnual: string; early: string; tight: string; balanced: string; noReturn: string },
): null | { tone: ContribInsightTone; annual: number; pureYears: number | null; yearsLeft: number | null; message: string; footnote: string } {
  if (monthly === undefined || monthly <= 0) return null;
  const annual = monthly * 12;
  if (partialEuro === null || partialEuro <= 0) {
    return { tone: "neutral", annual, pureYears: null, yearsLeft, message: messages.pureOnly, footnote: messages.noReturn };
  }
  const pureYears = partialEuro / annual;
  if (annual >= partialEuro) {
    return { tone: "warn", annual, pureYears, yearsLeft, message: messages.exceedsAnnual, footnote: messages.noReturn };
  }
  if (yearsLeft !== null && yearsLeft > 0) {
    if (pureYears <= yearsLeft * 0.45) {
      return { tone: "caution", annual, pureYears, yearsLeft, message: messages.early, footnote: messages.noReturn };
    }
    if (pureYears >= yearsLeft * 1.35) {
      return { tone: "caution", annual, pureYears, yearsLeft, message: messages.tight, footnote: messages.noReturn };
    }
    return { tone: "ok", annual, pureYears, yearsLeft, message: messages.balanced, footnote: messages.noReturn };
  }
  return { tone: "neutral", annual, pureYears, yearsLeft, message: messages.pureOnly, footnote: messages.noReturn };
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
    phase: { accumulate: ["Aufbau", "Noch weit bis zum Zieltermin – Beiträge werden im Aufbau-Szenario gezeigt."], transition: ["Übergang", "Der Sicherheitszeitraum beginnt – Beiträge werden als neutrale Szenarioansicht gezeigt."], protect: ["Schutz", "Der Zieltermin rückt näher – der sichere Teil steht im Vordergrund."], use: ["Verwenden", "Zieljahr erreicht – bestätigten Bedarf und verfügbare Mittel vergleichen."] },
    contribution: "Monatlicher Beitrag", contributionHint: "Nur Vorschau · keine Buchung", contributionYear: "Jahr",
    insightAnnual: "Pro Jahr", insightPure: "Nur Beiträge", insightHorizon: "Horizont",
    insightPureOnly: "Jährlicher Beitrag als Vorschau.",
    insightExceeds: "Ein Jahresbeitrag deckt den Zielbetrag bereits — Eingabe prüfen.",
    insightEarly: "Mit diesem Beitrag würde der Zielbetrag (nur Beiträge) deutlich vor dem Horizont erreicht.",
    insightTight: "Mit diesem Beitrag reichen reine Beiträge vor dem Zieljahr möglicherweise nicht.",
    insightBalanced: "Beitrag und Zeithorizont passen grob zusammen (nur Beiträge, ohne Rendite).",
    insightNoReturn: "Ohne Rendite · keine Anlageberatung · keine Buchung.",
    safe: "Sicherer Teil", vwce: "VWCE", targetDate: "Zieltermin", fullAmount: "Nahezu gesamtes Vermögen verwenden", targetAmount: "Zielbetrag", safeWindow: "Sicherheitszeitraum (Vorschau)", milestones: ["Heute", "Sicherheit beginnt", "Zieljahr"], advanced: "Erweitert für Simulation", advancedHelp: "Rendite, Inflation und Sicherheitsmarge", simulation: "Annahmen für Ziel & Simulation", simulationNote: "Nur für Ziel und Simulation; keine Buchung wird verändert.", vwceReturn: "VWCE-Rendite", inflation: "Inflation", safeReturn: "Sicherer Teil", buffer: "Sicherheitsmarge", save: "Fertig", resultTitle: "Ergebnisvorschau", resultSafeStart: "Sicherheit ab", resultNeedYear: "Zieljahr", resultThisYear: "Dieses Jahr", fullPortfolio: "Nahezu gesamtes Vermögen", yearPlanTitle: "Jahresplan", yearPlanSubtitle: "Vorschau aus Ihren Plan- und Beitragsangaben · keine Buchung wird erzeugt.", currentMarker: "Heute", safeMarker: "Sicherheitsbeginn", goalMarker: "Zieljahr",
    everyday: "Im Alltag", language: "Sprache", appearance: "Darstellung",
    planGroup: "PLAN", displayGroup: "ANZEIGE", dataGroup: "DATEN", securityGroup: "SICHERHEIT", otherGroup: "SONSTIGES",
    profileSub: "Profil & Infos", goalRow: "Ziel", backupRestore: "Sichern & wiederherstellen", syncRow: "Synchronisierung",
    vwcePrice: "VWCE-Kurs", passwordRow: "Passwort", mfaRow: "Zwei-Faktor-Auth", mfaOn: "Aktiviert", mfaOff: "Nicht aktiviert",
    versionLabel: "Version", wallet: "Cash-Modell in der App", walletHelp: "Bestehende Buchungslogik bleibt unverändert.", security: "Sicherheit", password: "Passwort", recovery: "Wiederherstellungslink", mfa: "MFA / TOTP", signOut: "Abmelden",
    prices: "Kurse", pricesHelp: "Feed-Status und wirksame Kurse", pricesInfo: "Details zur Kursquelle", data: "Daten & Betrieb", sync: "Gesundheit & Synchronisierung", syncNow: "Jetzt synchronisieren", transfers: "Sicherung & Gerätewechsel", backup: "JSON sichern", restore: "Daten wiederherstellen", csv: "CSV exportieren", device: "Gerät wiederherstellen", handoff: "Notfallmappe & Übergabe", diagnostics: "Gerätedetails", danger: "Gefahrenbereich", localDetails: "Daten auf diesem Gerät", close: "Schließen", perYear: "%/Jahr", missingContribution: "Kein Monatsbeitrag konfiguriert", useNeed: "Bedarf in diesem Jahr", safeAvailable: "Sicher verfügbar",
  };
  return {
    title: "Cài đặt", tabs: { general: "Chung", prices: "Giá", data: "Dữ liệu" }, saved: "Đã lưu",
    fund: "QUỸ GIA ĐÌNH", editProfile: "Chỉnh hồ sơ", profile: "Hồ sơ gia đình", planName: "Tên kế hoạch", childName: "Tên bé", account: "Tài khoản đứng tên", parent: "Cha/mẹ", child: "Bé",
    plan: "Kế hoạch", planEmpty: "Chưa có mục tiêu", planEmptyCopy: "Thêm năm và số tiền cần để xem kế hoạch năm nay.", addGoal: "Thêm mục tiêu", configurePlan: "Tùy chỉnh kế hoạch", annual: "NĂM NAY", disclaimer: "Gợi ý minh họa · không thay đổi giao dịch đã ghi.",
    phase: { accumulate: ["Tích lũy", "Còn xa hạn — khoản góp được hiển thị theo pha tích lũy."], transition: ["Chuyển dần", "Đang vào cửa sổ an toàn — bảng chỉ là kịch bản minh họa."], protect: ["Bảo vệ", "Gần hạn — phần an toàn được hiển thị nổi bật."], use: ["Rút", "Năm cần tiền — đối chiếu nhu cầu với phần an toàn đã xác nhận."] },
    contribution: "Khoản góp hằng tháng", contributionHint: "Chỉ minh họa · không tạo giao dịch", contributionYear: "năm",
    insightAnnual: "Mỗi năm", insightPure: "Góp thuần", insightHorizon: "Còn lại",
    insightPureOnly: "Tổng góp minh họa theo năm.",
    insightExceeds: "Góp một năm đã ≥ mục tiêu — nên kiểm tra lại số.",
    insightEarly: "Với mức này, góp thuần có thể đủ mục tiêu sớm hơn khung năm đã chọn.",
    insightTight: "Với mức này, góp thuần có thể chưa đủ trước năm cần tiền.",
    insightBalanced: "Mức góp và khung thời gian khá khớp (chỉ góp thuần, không tính lãi).",
    insightNoReturn: "Không tính lợi suất · không phải tư vấn · không tạo giao dịch.",
    safe: "Phần an toàn", vwce: "VWCE", targetDate: "Năm / ngày cần tiền", fullAmount: "Dùng gần như toàn bộ danh mục", targetAmount: "Số € mục tiêu", safeWindow: "Cửa sổ an toàn (preview)", milestones: ["Hôm nay", "Bắt đầu an toàn", "Năm cần tiền"], advanced: "Nâng cao cho mô phỏng", advancedHelp: "Lợi suất, lạm phát và biên an toàn", simulation: "Giả định mô phỏng", simulationNote: "Chỉ dùng cho mục tiêu và mô phỏng; không thay đổi giao dịch đã ghi.", vwceReturn: "Lợi suất VWCE", inflation: "Lạm phát", safeReturn: "Phần an toàn", buffer: "Biên an toàn", save: "Xong", resultTitle: "Kết quả gợi ý", resultSafeStart: "Bắt đầu an toàn", resultNeedYear: "Năm cần tiền", resultThisYear: "Năm nay", fullPortfolio: "Gần như toàn bộ danh mục", yearPlanTitle: "Kế hoạch từng năm", yearPlanSubtitle: "Bảng dự kiến từ năm bắt đầu đến năm cần tiền · không tạo lệnh mua/bán.", currentMarker: "Hiện tại", safeMarker: "Mốc an toàn", goalMarker: "Mốc mục tiêu",
    everyday: "Tùy chọn hằng ngày", language: "Ngôn ngữ", appearance: "Giao diện",
    planGroup: "KẾ HOẠCH", displayGroup: "HIỂN THỊ", dataGroup: "DỮ LIỆU", securityGroup: "BẢO MẬT", otherGroup: "KHÁC",
    profileSub: "Hồ sơ & thông tin", goalRow: "Mục tiêu", backupRestore: "Sao lưu & khôi phục", syncRow: "Đồng bộ",
    vwcePrice: "Giá VWCE", passwordRow: "Mật khẩu", mfaRow: "Xác thực 2 lớp", mfaOn: "Đã bật", mfaOff: "Chưa bật",
    versionLabel: "Phiên bản", wallet: "Ví trong app", walletHelp: "Giữ nguyên logic ghi nhận tiền nạp trước lệnh mua hiện có.", security: "Bảo mật", password: "Đổi mật khẩu", recovery: "Link khôi phục", mfa: "MFA / TOTP", signOut: "Đăng xuất",
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
  return createPortal(<div className="p40-sheet-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="p40-sheet" role="dialog" aria-modal="true" aria-label={title}><div className="p40-sheet-grabber" aria-hidden /><header><strong>{title}</strong><button type="button" aria-label={closeLabel} onClick={onClose}>×</button></header><div className="p40-sheet-body">{children}</div></section></div>, document.body);
}


const THEME_DOT: Record<ThemeChoice, string> = {
  premium: "linear-gradient(135deg, #E8D5A3, #B98A2F)",
  dark: "#2A2650",
  light: "#FFFFFF",
};

function relativeTime(iso: string, locale: AppLocale): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return locale === "de" ? "gerade eben" : "vừa xong";
  if (mins < 60) return locale === "de" ? `vor ${mins} Min.` : `${mins} phút trước`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return locale === "de" ? `vor ${hours} Std.` : `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  return locale === "de" ? `vor ${days} T.` : `${days} ngày trước`;
}

function SetRow({ icon, label, value, onClick, danger }: {
  icon: ReactNode; label: string; value?: ReactNode; onClick?: () => void; danger?: boolean;
}) {
  return (
    <button type="button" className={"set2-row" + (danger ? " danger" : "")} onClick={onClick}>
      <span className="set2-ric" aria-hidden="true">{icon}</span>
      <span className="set2-rtitle">{label}</span>
      {value != null && value !== "" ? <span className="set2-rval">{value}</span> : null}
      <IconChevronRight aria-hidden="true" />
    </button>
  );
}

export default function SettingsCboWorkspace(props: Props) {
  const copy = copyFor(props.locale);
  const [sheet, setSheet] = useState<SettingsSheet>(null);
  const [planFocus, setPlanFocus] = useState<"contribution" | "goal" | "yearplan" | null>(null);
  const sheetBodyRef = useRef<HTMLDivElement>(null);
  const [simReturn, setSimReturn] = useState<SettingsSheet>(null);
  const [deRiskYears, setDeRiskYears] = useState(5);
  const [contributionDraft, setContributionDraft] = useState("");
  const target = props.settings.planTarget ?? { targetUseDate: props.settings.endDate ?? "", needFullAmount: true };
  const today = useMemo(() => new Date(), []);
  const currentYear = today.getFullYear();
  const goalYear = /^\d{4}/.test(target.targetUseDate) ? Number(target.targetUseDate.slice(0, 4)) : currentYear;
  const themes: Array<{ value: ThemeChoice; label: string }> = props.locale === "de" ? [{ value: "premium", label: "Vault" }, { value: "dark", label: "Ozean" }, { value: "light", label: "Ember" }] : [{ value: "premium", label: "Vault" }, { value: "dark", label: "Ocean" }, { value: "light", label: "Ember" }];
  const contributionParsed = parseNumber(contributionDraft);
  const partialEuroForInsight =
    !target.needFullAmount && Number.isFinite(target.partialNeedEuro) && (target.partialNeedEuro ?? 0) > 0
      ? Number(target.partialNeedEuro)
      : null;
  const yearsLeftForInsight = yearsTo(target.targetUseDate, today);
  const contributionInsight = buildContributionInsight(contributionParsed, partialEuroForInsight, yearsLeftForInsight, {
    pureOnly: copy.insightPureOnly,
    exceedsAnnual: copy.insightExceeds,
    early: copy.insightEarly,
    tight: copy.insightTight,
    balanced: copy.insightBalanced,
    noReturn: copy.insightNoReturn,
  });

  const editTarget = (patch: Partial<PlanTarget>) => props.onChangeTarget({ ...target, ...patch });
  const updateRate = (key: "vwceReturn" | "inflationRate" | "safeReturn" | "bufferPct", value: string) => { const parsed = parsePercent(value); if (parsed !== undefined) props.onPatchSettings({ [key]: parsed }); };
  const yearlyPlanRows = useMemo(() => buildYearlyPlanRows(props.settings, target, deRiskYears, currentYear), [props.settings, target, deRiskYears, currentYear]);

  const applyContribution = (value: number) => {
    const next = Math.max(0, Math.round(value));
    setContributionDraft(String(next));
    props.onPatchSettings({ contributionY1: next, contributionY2: next });
  };

  useEffect(() => {
    if (sheet !== "plan") return;
    const stored = props.settings.contributionY2 > 0
      ? props.settings.contributionY2
      : props.settings.contributionY1 > 0
        ? props.settings.contributionY1
        : "";
    setContributionDraft(stored === "" ? "" : String(stored));
  }, [sheet, props.settings.contributionY1, props.settings.contributionY2]);

  const autoOpenedRef = useRef<string | null>(null);
  useEffect(() => {
    if (autoOpenedRef.current === props.activeTab) return;
    autoOpenedRef.current = props.activeTab;
    if (props.activeTab === "data") setSheet("sync");
    else if (props.activeTab === "prices") setSheet("prices");
  }, [props.activeTab]);

  const contribution = props.settings.contributionY2 > 0 ? props.settings.contributionY2 : props.settings.contributionY1 > 0 ? props.settings.contributionY1 : null;
  const targetYear = /^\d{4}/.test(target.targetUseDate) ? target.targetUseDate.slice(0, 4) : "";
  const planName = props.settings.planName || "VWCE Vault";
  const avatarInitial = (props.settings.childName || planName).trim().slice(0, 1).toUpperCase();

  return <div className="set2">
    <h1 className="set2-title">{copy.title}</h1>

    <button type="button" className="set2-profile" onClick={() => setSheet("profile")}>
      <span className="set2-avatar" aria-hidden="true">{avatarInitial}</span>
      <span className="set2-ptext">
        <strong>{planName}</strong>
        <small>{copy.profileSub}</small>
      </span>
      <IconChevronRight aria-hidden="true" />
    </button>

    <h2 className="set2-gtitle">{copy.planGroup}</h2>
    <div className="set2-group">
      <SetRow icon={<IconCash />} label={copy.contribution} value={contribution != null ? money(contribution, props.locale) : "—"} onClick={() => { setPlanFocus("contribution"); setSheet("plan"); }} />
      <SetRow icon={<IconGoal />} label={copy.goalRow} value={targetYear || "—"} onClick={() => { setPlanFocus("goal"); setSheet("plan"); }} />
      <SetRow icon={<IconSim />} label={copy.simulation} onClick={() => { setSimReturn(null); setSheet("simulation"); }} />
      <SetRow icon={<IconArchive />} label={copy.yearPlanTitle} onClick={() => { setPlanFocus("yearplan"); setSheet("plan"); }} />
    </div>

    <h2 className="set2-gtitle">{copy.displayGroup}</h2>
    <div className="set2-group">
      <button type="button" className="set2-row" onClick={() => setSheet("theme")}>
        <span className="set2-ric" aria-hidden="true"><IconSliders /></span>
        <span className="set2-rtitle">{copy.appearance}</span>
        <span className="set2-dots" aria-hidden="true">
          {(Object.keys(THEME_DOT) as ThemeChoice[]).map((value) => (
            <i key={value} style={{ background: THEME_DOT[value] }} className={props.theme === value ? "on" : ""} />
          ))}
        </span>
        <IconChevronRight aria-hidden="true" />
      </button>
      <SetRow icon={<IconLanguage />} label={copy.language} value={props.locale === "de" ? "Deutsch" : "Tiếng Việt"} onClick={() => setSheet("language")} />
    </div>

    <h2 className="set2-gtitle">{copy.dataGroup}</h2>
    <div className="set2-group">
      <SetRow icon={<IconArchive />} label={copy.backupRestore} onClick={() => setSheet("transfers")} />
      <SetRow icon={<IconSync />} label={copy.syncRow} value={props.lastSyncAt ? relativeTime(props.lastSyncAt, props.locale) : undefined} onClick={() => setSheet("sync")} />
      <SetRow icon={<IconCash />} label={copy.vwcePrice} onClick={() => setSheet("prices")} />
      <button type="button" className="set2-row" onClick={props.onExportCsv}>
        <span className="set2-ric" aria-hidden="true"><IconUpload /></span>
        <span className="set2-rtitle">{copy.csv}</span>
        <IconChevronRight aria-hidden="true" />
      </button>
    </div>

    <h2 className="set2-gtitle">{copy.securityGroup}</h2>
    <div className="set2-group">
      <SetRow icon={<IconLock />} label={copy.passwordRow} onClick={() => props.onOpenChild("password-change")} />
      <SetRow icon={<IconShield />} label={copy.recovery} onClick={() => props.onOpenChild("password-reset")} />
      <SetRow icon={<IconShield />} label={copy.mfaRow} value={props.mfaEnrolled ? copy.mfaOn : copy.mfaOff} onClick={() => props.onOpenChild("mfa")} />
      {props.onSignOut ? (
        <button type="button" className="set2-row" onClick={props.onSignOut}>
          <span className="set2-ric" aria-hidden="true"><IconClose /></span>
          <span className="set2-rtitle">{copy.signOut}</span>
          <IconChevronRight aria-hidden="true" />
        </button>
      ) : null}
    </div>

    <h2 className="set2-gtitle">{copy.otherGroup}</h2>
    <div className="set2-group set2-legacy">
      {props.handoffAction}
      {props.dangerAction}
    </div>

    <p className="set2-foot">
      <span className="set2-saved" role="status">✓ {props.saveLabel || copy.saved}</span>
      {props.appVersion ? <span>{copy.versionLabel} {props.appVersion}</span> : null}
    </p>


    {sheet === "profile" ? <Sheet title={copy.profile} closeLabel={copy.close} onClose={() => setSheet(null)}><div className="p40-sheet-fields"><label><span>{copy.planName}</span><input value={props.settings.planName} onChange={(event) => props.onPatchSettings({ planName: event.target.value })} /></label><label><span>{copy.childName}</span><input value={props.settings.childName} onChange={(event) => props.onPatchSettings({ childName: event.target.value })} /></label><div><span>{copy.account}</span><div className="p40-segments"><button type="button" className={props.settings.accountType === "parent" ? "selected" : ""} onClick={() => props.onPatchSettings({ accountType: "parent" })}>{copy.parent}</button><button type="button" className={props.settings.accountType === "child" ? "selected" : ""} onClick={() => props.onPatchSettings({ accountType: "child" })}>{copy.child}</button></div></div></div><button type="button" className="p40-sheet-done" onClick={() => setSheet(null)}>{copy.save}</button></Sheet> : null}
    {sheet === "plan" ? <Sheet title={planFocus === "contribution" ? copy.contribution : planFocus === "goal" ? copy.goalRow : planFocus === "yearplan" ? copy.yearPlanTitle : copy.plan} closeLabel={copy.close} onClose={() => { setSheet(null); setPlanFocus(null); }}>
      <div className="p40-sheet-fields" data-focus-section="goal">
        <label><span>{copy.targetDate}</span><input type="date" value={target.targetUseDate} onChange={(event) => editTarget({ targetUseDate: event.target.value })} /></label>
        <label className="p40-toggle-row"><span><strong>{copy.fullAmount}</strong></span><input type="checkbox" checked={target.needFullAmount} onChange={(event) => editTarget({ needFullAmount: event.target.checked, partialNeedEuro: event.target.checked ? undefined : target.partialNeedEuro })} /></label>
        {!target.needFullAmount ? <label><span>{copy.targetAmount}</span><input inputMode="decimal" type="number" min="0" value={target.partialNeedEuro ?? ""} onChange={(event) => editTarget({ partialNeedEuro: parseNumber(event.target.value) })} /></label> : null}
        <div className="p40-contrib" data-testid="p40-contribution-block" data-focus-section="contribution">
          <div className="p40-contrib-head">
            <span>{copy.contribution}</span>
            <small>{copy.contributionHint}</small>
          </div>
          <div className="p40-contrib-hero">
            <button type="button" className="p40-contrib-step" aria-label="-10" disabled={(contributionParsed ?? 0) <= 0} onClick={() => applyContribution((contributionParsed ?? 0) - 10)}>−</button>
            <div className="p40-contrib-field">
              <input data-testid="p40-contribution-input" inputMode="decimal" type="text" autoComplete="off" value={contributionDraft} onChange={(event) => {
                const raw = event.target.value;
                setContributionDraft(raw);
                if (raw.trim() === "") return;
                const parsed = parseNumber(raw);
                if (parsed === undefined || parsed < 0) return;
                props.onPatchSettings({ contributionY1: parsed, contributionY2: parsed });
              }} />
              <span aria-hidden>€</span>
            </div>
            <button type="button" className="p40-contrib-step" aria-label="+10" onClick={() => applyContribution((contributionParsed ?? 0) + 10)}>+</button>
          </div>
          <div className="p40-contrib-presets" role="group" aria-label={copy.contribution}>
            {CONTRIBUTION_PRESETS.map((preset) => (
              <button key={preset} type="button" className={contributionParsed === preset ? "selected" : ""} onClick={() => applyContribution(preset)}>{preset}</button>
            ))}
          </div>
          {contributionInsight ? (
            <div className={`p40-contrib-insight p40-contrib-insight--${contributionInsight.tone}`} data-testid="p40-contrib-insight" role="status">
              <div className="p40-contrib-insight-metrics">
                <div><span>{copy.insightAnnual}</span><strong>{money(contributionInsight.annual, props.locale)}</strong></div>
                <div><span>{copy.insightPure}</span><strong>{contributionInsight.pureYears === null ? "—" : `≈ ${formatPlainYears(contributionInsight.pureYears, props.locale)} ${copy.contributionYear}`}</strong></div>
                <div><span>{copy.insightHorizon}</span><strong>{contributionInsight.yearsLeft === null ? "—" : `${contributionInsight.yearsLeft} ${copy.contributionYear}`}</strong></div>
              </div>
              <p>{contributionInsight.message}</p>
              <small>{contributionInsight.footnote}</small>
            </div>
          ) : null}
        </div>
        <div><span>{copy.safeWindow}</span><div className="p40-segments">{[3, 5, 7].map((value) => <button key={value} type="button" className={deRiskYears === value ? "selected" : ""} onClick={() => setDeRiskYears(value)}>{value} {props.locale === "de" ? "J." : "năm"}</button>)}</div></div>
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
          <small>{copy.disclaimer}</small>
        </div>;
      })()}
      {yearlyPlanRows.length > 0 ? <section aria-label={copy.yearPlanTitle} data-focus-section="yearplan" style={{ display: "grid", gap: 10 }}>
        {planFocus !== "yearplan" ? <div>
          <strong style={{ display: "block", color: "var(--p40-ink)", fontSize: 17, letterSpacing: "-.02em" }}>{copy.yearPlanTitle}</strong>
          <small style={{ display: "block", marginTop: 4, color: "var(--p40-muted)", fontSize: 12, lineHeight: 1.4 }}>{copy.yearPlanSubtitle}</small>
        </div> : null}
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
      <button type="button" className="p40-advanced-link" onClick={() => { setSimReturn("plan"); setSheet("simulation"); }}>{copy.advanced}<small>{copy.advancedHelp}</small><IconChevronRight aria-hidden /></button>
      <button type="button" className="p40-sheet-done" onClick={() => setSheet(null)}>{copy.save}</button>
    </Sheet> : null}
    {sheet === "simulation" ? <Sheet title={copy.simulation} closeLabel={copy.close} onClose={() => setSheet(simReturn)}><p className="p40-sheet-note">{copy.simulationNote}</p><div className="p40-sheet-fields p40-percent-grid"><label><span>{copy.vwceReturn}</span><input inputMode="decimal" value={String(props.settings.vwceReturn * 100)} onChange={(event) => updateRate("vwceReturn", event.target.value)} /><small>{copy.perYear}</small></label><label><span>{copy.inflation}</span><input inputMode="decimal" value={String(props.settings.inflationRate * 100)} onChange={(event) => updateRate("inflationRate", event.target.value)} /><small>{copy.perYear}</small></label><label><span>{copy.safeReturn}</span><input inputMode="decimal" value={String(props.settings.safeReturn * 100)} onChange={(event) => updateRate("safeReturn", event.target.value)} /><small>{copy.perYear}</small></label><label><span>{copy.buffer}</span><input inputMode="decimal" value={String(props.settings.bufferPct * 100)} onChange={(event) => updateRate("bufferPct", event.target.value)} /><small>%</small></label></div><button type="button" className="p40-sheet-done" onClick={() => setSheet("plan")}>{copy.save}</button></Sheet> : null}

    {sheet === "theme" ? <Sheet title={copy.appearance} closeLabel={copy.close} onClose={() => setSheet(null)}>
      <div className="set2-theme-list">
        {themes.map((theme) => (
          <button
            key={theme.value}
            type="button"
            className={"set2-theme" + (props.theme === theme.value ? " on" : "")}
            aria-pressed={props.theme === theme.value}
            onClick={() => { props.onTheme(theme.value); setSheet(null); }}
          >
            <i style={{ background: THEME_DOT[theme.value] }} aria-hidden="true" />
            <span>{theme.label}</span>
            {props.theme === theme.value ? <b aria-hidden="true">✓</b> : null}
          </button>
        ))}
      </div>
    </Sheet> : null}
    {sheet === "language" ? <Sheet title={copy.language} closeLabel={copy.close} onClose={() => setSheet(null)}>
      <div className="set2-theme-list">
        {(["vi", "de"] as AppLocale[]).map((value) => (
          <button
            key={value}
            type="button"
            className={"set2-theme" + (props.locale === value ? " on" : "")}
            aria-pressed={props.locale === value}
            onClick={() => { props.onLocale(value); setSheet(null); }}
          >
            <span>{value === "vi" ? (props.locale === "de" ? "Vietnamesisch" : "Tiếng Việt") : (props.locale === "de" ? "Deutsch" : "Tiếng Đức")}</span>
            {props.locale === value ? <b aria-hidden="true">✓</b> : null}
          </button>
        ))}
      </div>
    </Sheet> : null}
    {sheet === "prices" ? <Sheet title={copy.vwcePrice} closeLabel={copy.close} onClose={() => setSheet(null)}>
      <div className="set2-panel">{props.pricesPanel}</div>
    </Sheet> : null}
    {sheet === "sync" ? <Sheet title={copy.syncRow} closeLabel={copy.close} onClose={() => setSheet(null)}>
      {props.lastSync ? <p className="set2-sync-sub">{props.lastSync}</p> : null}
      <div className="set2-panel">{props.syncHealthPanel}</div>
      <button type="button" className="set2-sync-btn" disabled={props.syncing} onClick={props.onSync}>
        <IconSync aria-hidden="true" />{props.syncing ? props.syncLabel : copy.syncNow}
      </button>
      <div className="set2-panel">{props.syncConflictPanel}</div>
    </Sheet> : null}
    {sheet === "transfers" ? <Sheet title={copy.backupRestore} closeLabel={copy.close} onClose={() => setSheet(null)}>
      <div className="set2-actions">
        <button type="button" className="set2-action" onClick={() => { setSheet(null); props.onOpenChild("backup"); }}>
          <IconArchive aria-hidden="true" /><span>{copy.backup}</span><IconChevronRight aria-hidden="true" />
        </button>
        <button type="button" className="set2-action" onClick={() => { setSheet(null); props.onOpenChild("restore"); }}>
          <IconUpload aria-hidden="true" /><span>{copy.restore}</span><IconChevronRight aria-hidden="true" />
        </button>
        <button type="button" className="set2-action" onClick={props.onExportCsv}>
          <IconCash aria-hidden="true" /><span>{copy.csv}</span><IconChevronRight aria-hidden="true" />
        </button>
        {props.onOpenMigrate ? (
          <button type="button" className="set2-action" onClick={() => { setSheet(null); props.onOpenMigrate?.(); }}>
            <IconSync aria-hidden="true" /><span>{copy.device}</span><IconChevronRight aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </Sheet> : null}

  </div>;
}
