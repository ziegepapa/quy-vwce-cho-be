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

/** Các hành động mà top bar có thể hiển thị. Trang tự đăng ký cái nó cần. */
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

/**
 * Dùng MỘT lần duy nhất trong App.
 * Handler giữ trong ref (đổi mỗi render, không nên gây re-render).
 * Chỉ danh sách TÊN nằm trong state, nên App chỉ render lại khi
 * một trang đăng ký hoặc bỏ đăng ký hành động.
 */
export function useNavActionRegistry() {
  const handlers = useRef(new Map<NavActionName, () => void>());
  const [names, setNames] = useState<readonly NavActionName[]>([]);

  const api = useMemo<RegistryApi>(
    () => ({
      register(name, fn) {
        handlers.current.set(name, fn);
        setNames((prev) => (prev.includes(name) ? prev : [...prev, name]));
      },
      unregister(name) {
        handlers.current.delete(name);
        setNames((prev) =>
          prev.includes(name) ? prev.filter((n) => n !== name) : prev,
        );
      },
    }),
    [],
  );

  const navAction = useCallback(
    (name: NavActionName): (() => void) | undefined => {
      if (!names.includes(name)) return undefined;
      return () => {
        const fn = handlers.current.get(name);
        if (fn) fn();
      };
    },
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
 * Dùng trong trang. Phải gọi TRƯỚC mọi return sớm của component,
 * nếu không thứ tự hook sẽ đổi giữa các render.
 */
export function useNavAction(name: NavActionName, fn: () => void) {
  const ctx = useContext(NavActionsContext);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!ctx) return;
    ctx.register(name, () => fnRef.current());
    return () => ctx.unregister(name);
  }, [ctx, name]);
}
