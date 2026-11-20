import { useLocale } from "../lib/locale";
import "../styles/modern-wealth-journal.css";

function onboardingCopy(locale: "vi" | "de") {
  return locale === "de" ? {
    title: "VWCE-Fonds für das Kind",
    subtitle: "Verfolgen Sie den langfristigen VWCE-Plan mit regelmäßigen Beiträgen — ohne festes Zieldatum. Die Familienaufzeichnung bleibt nur auf diesem Gerät.",
    disclaimer: "Diese App dient ausschließlich der Planung und Simulation. Sie ist keine Anlage- oder Steuerberatung und gibt keine Renditegarantie. Rendite, Inflation und Steuern sind Annahmen.",
    start: "Starten",
  } : {
    title: "Quỹ VWCE cho bé",
    subtitle: "Theo dõi kế hoạch VWCE dài hạn, góp đều hằng tháng — không có ngày đích cố định. Hồ sơ gia đình chỉ lưu trên thiết bị này.",
    disclaimer: "Ứng dụng này chỉ hỗ trợ theo dõi và mô phỏng kế hoạch. Đây không phải tư vấn đầu tư, tư vấn thuế hoặc cam kết lợi nhuận. Lợi suất, lạm phát và thuế là giả định.",
    start: "Bắt đầu",
  };
}

export default function Onboarding({ onDone }: { onDone: () => void }) {
  const { locale } = useLocale();
  const text = onboardingCopy(locale);
  return (
    <main className="app-shell mwj-welcome">
      <div className="mwj-welcome-brand" aria-hidden="true"><span className="mwj-leaf">✦</span> VWCE Vault</div>
      <div className="mwj-welcome-story">
        <div className="mwj-sun" aria-hidden="true" />
        <div className="mwj-hill mwj-hill-back" aria-hidden="true" />
        <div className="mwj-hill mwj-hill-front" aria-hidden="true" />
        <div className="mwj-welcome-copy">
          <h1>{text.title}</h1>
          <p>{text.subtitle}</p>
        </div>
      </div>
      <div className="mwj-welcome-actions">
        <p className="mwj-disclaimer">{text.disclaimer}</p>
        <button className="mwj-start" type="button" onClick={onDone}>{text.start}<span aria-hidden="true">→</span></button>
      </div>
    </main>
  );
}
