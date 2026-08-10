/**
 * Chủ đề giao diện — ba lựa chọn tường minh, không theo iOS.
 *
 * `premium` được giữ làm khóa nội bộ để mọi thiết bị đã lưu lựa chọn cũ tiếp
 * tục hoạt động. Tên sản phẩm và visual language mới của khóa này là Aurora.
 */
export type ThemeChoice = "light" | "dark" | "premium";

export const THEME_KEY = "vwce-theme";

const DEFAULT_THEME: ThemeChoice = "premium";

export const THEME_LABEL: Record<ThemeChoice, string> = {
  light: "Sáng",
  dark: "Tối",
  premium: "Aurora",
};

export const THEME_OPTIONS: Array<{ value: ThemeChoice; label: string }> = [
  { value: "light", label: THEME_LABEL.light },
  { value: "dark", label: THEME_LABEL.dark },
  { value: "premium", label: THEME_LABEL.premium },
];

function isTheme(v: unknown): v is ThemeChoice {
  return v === "light" || v === "dark" || v === "premium";
}

export function readTheme(): ThemeChoice {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return isTheme(v) ? v : DEFAULT_THEME;
  } catch {
    /* Safari riêng tư chặn đọc localStorage */
    return DEFAULT_THEME;
  }
}

/** Ghi thuộc tính data-theme lên thẻ html; các stylesheet đọc thuộc tính này. */
export function applyTheme(t: ThemeChoice): void {
  document.documentElement.dataset.theme = t;
}

export function persistTheme(t: ThemeChoice): void {
  applyTheme(t);
  try {
    localStorage.setItem(THEME_KEY, t);
  } catch {
    /* không ghi được thì vẫn đổi cho phiên này */
  }
}

// Chạy ngay khi module được nạp, trước khung hình đầu tiên, nên không bị
// nháy trắng rồi mới đổi sang theme mặc định Aurora.
applyTheme(readTheme());
