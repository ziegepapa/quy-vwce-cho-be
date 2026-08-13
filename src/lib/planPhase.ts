import type { PlanPhase, PlanStatus, PlanTarget } from "./types";

/**
 * Số năm còn lại đến targetIso tính từ now (floor).
 * Âm nếu đã qua mốc.
 */
export function yearsUntil(targetIso: string, now: Date = new Date()): number {
  const target = new Date(targetIso);
  const diffMs = target.getTime() - now.getTime();
  return Math.floor(diffMs / (365.25 * 24 * 3600 * 1000));
}

type PhaseRow = {
  minYears: number;
  status: PlanStatus;
  equityPct: number;
  title: string;
  summary: string;
  actions: string[];
};

/**
 * Bảng phase theo số năm còn lại — theo đúng tinh thần kế hoạch.
 * Sắp xếp giảm dần để find() trả kết quả đúng.
 */
const PHASE_TABLE: PhaseRow[] = [
  {
    minYears: 6,
    status: "GIỮ",
    equityPct: 100,
    title: "Giai đoạn tăng trưởng tối đa",
    summary:
      "Còn nhiều năm — giữ Savings Plan VWCE theo kế hoạch, không phản ứng theo biến động ngắn hạn.",
    actions: [
      "Giữ mức góp hàng tháng, kiểm tra giao dịch đã chạy",
      "Rà soát phí và sao kê mỗi năm; không thêm ETF chủ đề",
      "Xác nhận ngân sách gia đình vẫn bền vững",
    ],
  },
  {
    minYears: 5,
    status: "GIẢM",
    equityPct: 90,
    title: "Bắt đầu giảm rủi ro (còn 5 năm)",
    summary:
      "Bắt đầu dịch chuyển dần sang phần an toàn. Không dừng VWCE — chỉ giảm tỷ trọng cổ phiếu.",
    actions: [
      "Cân nhắc giảm Savings Plan VWCE ~10%, chuyển phần còn vào an toàn",
      "Xác nhận số tiền thật sự cần ở mốc rút",
      "Nghiên cứu lựa chọn phần an toàn (cash TR, Festgeld, money market ETF)",
    ],
  },
  {
    minYears: 4,
    status: "GIẢM",
    equityPct: 75,
    title: "Tăng dần phần an toàn (còn 4 năm)",
    summary:
      "Tiếp tục giảm tỷ trọng. Mục tiêu phần an toàn khoảng 25–30% danh mục.",
    actions: [
      "Điều chỉnh Savings Plan để tăng phần an toàn",
      "Chuyển một phần VWCE sang an toàn theo số dư thực tế tháng 01",
      "Lập quy tắc chuyển tiền theo thời gian, không theo tin tức",
    ],
  },
  {
    minYears: 3,
    status: "GIẢM",
    equityPct: 55,
    title: "Giảm sâu hơn (còn 3 năm)",
    summary:
      "Phần an toàn tiến gần 50%. Ưu tiên bảo vệ phần chắc chắn cần dùng.",
    actions: [
      "Mục tiêu phần an toàn khoảng 45–55% danh mục",
      "Khi thị trường giảm, dùng an toàn trước — không bán VWCE để đáp ứng chi linh hoạt",
      "Chỉ để VWCE phần không cần thiết trong 0–3 năm đầu",
    ],
  },
  {
    minYears: 2,
    status: "GIẢM",
    equityPct: 30,
    title: "Ưu tiên bảo toàn vốn (còn 2 năm)",
    summary:
      "Phần an toàn nên đạt 70%. Đây là thời điểm quan trọng nhất để giảm rủi ro.",
    actions: [
      "Mục tiêu phần an toàn khoảng 70% danh mục",
      "Tính lại glide path nếu ngày dùng thay đổi",
      "Không tăng rủi ro hoặc dùng đòn bẩy để gỡ khoảng thiếu",
    ],
  },
  {
    minYears: 1,
    status: "DỪNG",
    equityPct: 10,
    title: "Dừng góp mới vào cổ phiếu (còn 1 năm)",
    summary:
      "Bảo toàn khoản cần dùng trong 12 tháng kế tiếp. Phần cần dùng nên ở an toàn.",
    actions: [
      "Dừng Savings Plan VWCE; chuyển 150 €/tháng vào phần an toàn",
      "Phần an toàn mục tiêu khoảng 90% số tiền cần dùng",
      "Phần chưa dùng giữ nguyên — không bán hết mặc định",
    ],
  },
  {
    minYears: 0,
    status: "SỬ DỤNG",
    equityPct: 0,
    title: "Giai đoạn sử dụng",
    summary:
      "Đã đến mốc rút. Rút theo nhu cầu đã xác nhận; không bán hết một lần mặc định.",
    actions: [
      "Rút theo kế hoạch đã xác nhận — không bán hết một lần",
      "Phần chưa cần tiếp tục theo thời hạn mới",
      "Cân nhắc thuế lãi vốn (26,375%) khi bán từng phần — dàn trải qua nhiều năm thuế",
    ],
  },
];

/**
 * Trả về PlanPhase theo số năm còn lại đến target, hoặc null nếu target không hợp lệ.
 * Pure function — không có side effect, dễ test.
 */
export function getPlanPhase(
  target: PlanTarget | null | undefined,
  now: Date = new Date(),
): PlanPhase | null {
  if (!target?.targetUseDate) return null;

  const yl = yearsUntil(target.targetUseDate, now);
  // yearsLeft dùng cho display — không âm; yl (thực) dùng cho table lookup
  const yearsLeft = Math.max(yl, 0);

  // PHASE_TABLE sắp xếp giảm dần minYears: tìm row đầu tiên có yl >= minYears
  const row =
    PHASE_TABLE.find((r) => yl >= r.minYears) ??
    PHASE_TABLE[PHASE_TABLE.length - 1];

  const currentYear = now.getFullYear();
  const alreadyReminded = target.lastGlideReminderYear === currentYear;
  // Nhắc khi: chưa nhắc năm này VÀ (còn ≤ 6 năm hoặc đã chuyển phase)
  const isActivePhase = row.status !== "GIỮ" || yl <= 6;
  const showReminder = !alreadyReminded && isActivePhase;

  return {
    status: row.status,
    yearsLeft,
    equityPct: row.equityPct,
    title: row.title,
    summary: row.summary,
    actions: row.actions,
    showReminder,
  };
}

/**
 * Tạo PlanTarget mặc định từ ngày sinh bé (ISO date, ví dụ "2024-01-01").
 * Ngày sử dụng = năm sinh + 18, giữ tháng và ngày.
 */
export function defaultPlanTarget(birthDateIso: string): PlanTarget {
  const birth = new Date(birthDateIso);
  const targetYear = birth.getFullYear() + 18;
  // Tạo ngày trong UTC để tránh timezone shift
  const targetDate = `${targetYear}-${String(birth.getMonth() + 1).padStart(2, "0")}-${String(birth.getDate()).padStart(2, "0")}`;
  return {
    targetUseDate: targetDate,
    needFullAmount: true,
  };
}
