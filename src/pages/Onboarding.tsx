export default function Onboarding({ onDone }: { onDone: () => void }) {
  return (
    <div className="app-shell">
      <h1 className="page-title">Quỹ VWCE cho bé</h1>
      <p className="muted">Theo dõi kế hoạch VWCE 07/2026 → 06/2042. Dữ liệu chỉ lưu trên thiết bị này.</p>
      <div className="card disclaimer" style={{ marginTop: "1rem" }}>
        Ứng dụng này chỉ hỗ trợ theo dõi và mô phỏng kế hoạch. Đây không phải tư vấn đầu tư, tư vấn thuế hoặc cam kết lợi nhuận. Lợi suất, lạm phát và thuế là giả định.
      </div>
      <div className="stack" style={{ marginTop: "1.25rem" }}>
        <button type="button" onClick={onDone}>Bắt đầu</button>
      </div>
    </div>
  );
}
