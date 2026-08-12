import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * Chế độ chỉ đọc khi khôi phục dữ liệu chưa hoàn tất.
 *
 * Khi máy còn dữ liệu local nhưng phiên khôi phục chưa xong, Owner vẫn vào
 * được app và xem dữ liệu, nhưng mọi thao tác ghi phải bị chặn bằng đúng một
 * câu thông báo thân thiện — không lộ lỗi Dexie/JSON/backend ra giao diện.
 */
export const RECOVERY_READONLY_MESSAGE =
  "Hoàn tất khôi phục dữ liệu trước khi thay đổi dữ liệu.";

type RecoveryReadOnlyValue = {
  readOnly: boolean;
  message: string;
  notice: string | null;
  showBlocked: () => void;
  clearNotice: () => void;
};

const DEFAULT_VALUE: RecoveryReadOnlyValue = {
  readOnly: false,
  message: RECOVERY_READONLY_MESSAGE,
  notice: null,
  showBlocked: () => undefined,
  clearNotice: () => undefined,
};

const RecoveryReadOnlyContext = createContext<RecoveryReadOnlyValue>(DEFAULT_VALUE);

export function RecoveryReadOnlyProvider({
  readOnly,
  children,
}: {
  readOnly: boolean;
  children?: ReactNode;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  const showBlocked = useCallback(() => setNotice(RECOVERY_READONLY_MESSAGE), []);
  const clearNotice = useCallback(() => setNotice(null), []);
  const activeNotice = readOnly ? notice : null;
  const value = useMemo<RecoveryReadOnlyValue>(
    () => ({
      readOnly,
      message: RECOVERY_READONLY_MESSAGE,
      notice: activeNotice,
      showBlocked,
      clearNotice,
    }),
    [readOnly, activeNotice, showBlocked, clearNotice],
  );
  return (
    <RecoveryReadOnlyContext.Provider value={value}>
      {children}
      {activeNotice ? (
        <div
          className="banner error recovery-write-block"
          role="alert"
          data-testid="recovery-write-block"
        >
          {activeNotice}
        </div>
      ) : null}
    </RecoveryReadOnlyContext.Provider>
  );
}

export function useRecoveryReadOnly(): RecoveryReadOnlyValue {
  return useContext(RecoveryReadOnlyContext);
}
