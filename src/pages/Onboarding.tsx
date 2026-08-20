import { useLocale } from "../lib/locale";

function onboardingCopy(locale: "vi" | "de") {
  return locale === "de" ? {
    title: "VWCE-Fonds für das Kind",
    subtitle: "Verfolgen Sie den VWCE-Plan von 07/2026 bis 06/2042. Die Daten bleiben auf diesem Gerät.",
    disclaimer: "Diese App dient ausschließlich der Planung und Simulation. Sie ist keine Anlage- oder Steuerberatung und gibt keine Renditegarantie. Rendite, Inflation und Steuern sind Annahmen.",
    start: "Starten",
  } : {
    title: "Quỹ VWCE cho bé",
    subtitle: "Theo dõi kế hoạch VWCE 07/2026 → 06/2042. Dữ liệu chỉ lưu trên thiết bị này.",
    disclaimer: "Ứng dụng này chỉ hỗ trợ theo dõi và mô phỏng kế hoạch. Đây không phải tư vấn đầu tư, tư vấn thuế hoặc cam kết lợi nhuận. Lợi suất, lạm phát và thuế là giả định.",
    start: "Bắt đầu",
  };
}

export default function Onboarding({ onDone }: { onDone: () => void }) {
  const { locale } = useLocale();
  const text = onboardingCopy(locale);
  return (
    <div className="app-shell">
      <h1 className="page-title">{text.title}</h1>
      <p className="muted">{text.subtitle}</p>
      <div className="card disclaimer" style={{ marginTop: "1rem" }}>
        {text.disclaimer}
      </div>
      <div className="stack" style={{ marginTop: "1.25rem" }}>
        <button type="button" onClick={onDone}>{text.start}</button>
      </div>
    </div>
  );
}
