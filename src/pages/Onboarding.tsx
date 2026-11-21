import { useLocale } from "../lib/locale";

function onboardingCopy(locale: "vi" | "de") {
  return locale === "de" ? {
    subtitle: "Verfolge dein Portfolio, plane deine Ziele und erkunde langfristige Anlageszenarien.",
    disclaimer: "Diese App dient ausschließlich der Planung und Simulation. Sie ist keine Anlage- oder Steuerberatung und gibt keine Renditegarantie. Rendite, Inflation und Steuern sind Annahmen.",
    start: "Starten",
    highlights: "Wofür VWCE Vault da ist",
    features: [
      { title: "Portfolio auf einen Blick", detail: "Wert und Einzahlungen klar getrennt" },
      { title: "Ziele mit Perspektive", detail: "Fortschritt langfristig begleiten" },
      { title: "Wichtige Daten griffbereit", detail: "Notfallmappe für den Ernstfall" },
    ],
  } : {
    subtitle: "Theo dõi danh mục, đặt mục tiêu và khám phá các kịch bản đầu tư dài hạn.",
    disclaimer: "Ứng dụng này chỉ hỗ trợ theo dõi và mô phỏng kế hoạch. Đây không phải tư vấn đầu tư, tư vấn thuế hoặc cam kết lợi nhuận. Lợi suất, lạm phát và thuế là giả định.",
    start: "Bắt đầu",
    highlights: "VWCE Vault giúp bạn",
    features: [
      { title: "Danh mục trong tầm mắt", detail: "Phân biệt giá trị và vốn góp" },
      { title: "Mục tiêu có định hướng", detail: "Theo dõi tiến độ dài hạn" },
      { title: "Thông tin luôn sẵn sàng", detail: "Hồ sơ khẩn cấp khi cần" },
    ],
  };
}

export default function Onboarding({ onDone }: { onDone: () => void }) {
  const { locale, t } = useLocale();
  const text = onboardingCopy(locale);
  return (
    <main className="app-shell mwj-welcome">
      <div className="mwj-welcome-brand"><span className="mwj-brand-mark" aria-hidden="true">✦</span> VWCE Vault</div>
      <div className="mwj-welcome-story">
        <div className="mwj-welcome-copy">
          <h1>{t("tagline")}</h1>
          <p>{text.subtitle}</p>
        </div>
        <ul className="mwj-welcome-benefits" aria-label={text.highlights}>
          {text.features.map((feature, index) => (
            <li key={feature.title} className="mwj-welcome-benefit">
              <span className="mwj-welcome-benefit-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              <span className="mwj-welcome-benefit-copy">
                <strong>{feature.title}</strong>
                <small>{feature.detail}</small>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className="mwj-welcome-actions">
        <p className="mwj-disclaimer">{text.disclaimer}</p>
        <button className="mwj-start" type="button" onClick={onDone}>{text.start}<span aria-hidden="true">→</span></button>
      </div>
    </main>
  );
}
