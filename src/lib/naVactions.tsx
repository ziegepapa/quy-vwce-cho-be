import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * V9 B2 — ĐĂNG KÝ HÀNH ĐỘNG CHO TOP BAR
 *
 * Vấn đề: CollapsingNavBar sống ở App.tsx, nhưng hành động (mở modal giá,
 * mở ô tìm kiếm, mở form mục tiêu) lại nằm bên trong từng trang.
 *
 * Cách giải: mỗi trang gọi useNavAction("search", handler) khi mount.
 * Navbar chỉ hiện icon nào đã có trang đăng ký.
 *
 * Chốt quan trọng: hàm thật được giữ trong ref, chỉ *danh sách tên* là state.
 * Nếu đặt hàm vào state thì mỗi render của trang tạo một hàm mới
 * → setState → render lại → vòng lặp vô tận.
 */

export type NavActionName =
  | "updatePrice"
  | "search"
  | "filter"
  | "addGoal"
  | "changeScenario";

type RegistryApi = {
  register: (name: NavActionName, fn: () => void) => void;
  unregister: (name: NavActionName) => void;
};

const NavActionsContext = createContext<RegistryApi | null>(null);

/** Dùng MỘT lẦn, trong App.tsx. */
export function useNavActionRegistry() {
  const fns = useRef(new Map<NavActionName, () => void>());
  const [names, setNames] = useState<readonly NavActionName[]>([]);

  const register = useCallback((name: NavActionName, fn: () => void) => {
    fns.current.set(name, fn);
    setNames((prev) => (prev.includes(name) ? prev : [...prev, name]));
  }, []);

  const unregister = useCallback((name: NavActionName) => {
    fns.current.delete(name);
    setNames((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : prev,
    );
  }, []);

  const api = useMemo<RegistryApi>(
    () => ({ register, unregister }),
    [register, unregister],
  );

  /** navAction("search") → hàm, hoặc undefined nếu chưa trang nào đăng ký. */
  const navAction = useCallback(
    (name: NavActionName): (() => void) | undefined =>
      names.includes(name) ? () => fns.current.get(name)?.() : undefined,
    [names],
  );

  return { api, navAction };
}

export function NavActionsProvider({
  api,
  children,
}: {
  api: RegistryApi;
  children: ReactNode;
}) {
  return (
    <NavActionsContext.Provider value={api}>
      {children}
    </NavActionsContext.Provider>
  );
}

/**
 * Dùng trong trang. Ví dụ, trong Transactions.tsx:
 *   useNavAction("search", () => setSearchOpen(true));
 *
 * `fn` được phép đổi identity mọi render — không cần useCallback.
 */
export function useNavAction(name: NavActionName, fn: () => void) {
  const ctx = useContext(NavActionsContext);
  const fnRef = useRef(fn);
  // Cập nhật trong lúc render: an toàn vì không gây re-render,
  // và đảm bảo lần bấm đầu tiên gọi đúng closure mới nhất.
  fnRef.current = fn;

  useEffect(() => {
    if (!ctx) return;
    ctx.register(name, () => fnRef.current());
    return () => ctx.unregister(name);
  }, [ctx, name]);
}
