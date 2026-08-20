export const LOCAL_DIAGNOSTICS_STORAGE_KEY = "vwce:local-diagnostics:v1";
export const LOCAL_DIAGNOSTICS_LIMIT = 30;

export type DiagnosticCategory = "app-failure" | "page-failure" | "sync-health";
export type DiagnosticCode =
  | "unhandled-rejection"
  | "render-error"
  | "signed-out"
  | "recovery"
  | "conflict"
  | "retry"
  | "offline"
  | "syncing"
  | "pending"
  | "synced"
  | "sync-failed";

export type LocalDiagnosticEvent = {
  at: string;
  category: DiagnosticCategory;
  code: DiagnosticCode;
};

type StorageLike = Pick<Storage, "getItem" | "removeItem" | "setItem">;

const categories = new Set<DiagnosticCategory>(["app-failure", "page-failure", "sync-health"]);
const codes = new Set<DiagnosticCode>([
  "unhandled-rejection",
  "render-error",
  "signed-out",
  "recovery",
  "conflict",
  "retry",
  "offline",
  "syncing",
  "pending",
  "synced",
  "sync-failed",
]);

function browserStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  try { return window.localStorage; }
  catch { return null; }
}

function isEvent(value: unknown): value is LocalDiagnosticEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<LocalDiagnosticEvent>;
  return typeof event.at === "string"
    && !Number.isNaN(Date.parse(event.at))
    && typeof event.category === "string"
    && categories.has(event.category as DiagnosticCategory)
    && typeof event.code === "string"
    && codes.has(event.code as DiagnosticCode);
}

function readEvents(storage: StorageLike | null): LocalDiagnosticEvent[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(LOCAL_DIAGNOSTICS_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isEvent)
      .map(({ at, category, code }) => ({ at, category, code }))
      .slice(-LOCAL_DIAGNOSTICS_LIMIT);
  } catch {
    return [];
  }
}

function persist(events: LocalDiagnosticEvent[], storage: StorageLike | null) {
  if (!storage) return;
  try { storage.setItem(LOCAL_DIAGNOSTICS_STORAGE_KEY, JSON.stringify(events.slice(-LOCAL_DIAGNOSTICS_LIMIT))); }
  catch { /* Diagnostics are optional and must never block the application. */ }
}

export function getLocalDiagnostics(storage: StorageLike | null = browserStorage()): LocalDiagnosticEvent[] {
  return readEvents(storage);
}

export function recordLocalDiagnostic(
  input: Omit<LocalDiagnosticEvent, "at">,
  storage: StorageLike | null = browserStorage(),
  now: () => Date = () => new Date(),
): LocalDiagnosticEvent[] {
  if (!categories.has(input.category) || !codes.has(input.code)) return readEvents(storage);
  const next: LocalDiagnosticEvent = { at: now().toISOString(), category: input.category, code: input.code };
  const existing = readEvents(storage);
  const previous = existing.at(-1);
  // StrictMode and recovery handlers can report the same state twice in one instant.
  // Deduplicate only exact back-to-back codes; transitions remain visible.
  const events = previous?.category === next.category && previous.code === next.code
    ? existing
    : [...existing, next].slice(-LOCAL_DIAGNOSTICS_LIMIT);
  persist(events, storage);
  return events;
}

export function clearLocalDiagnostics(storage: StorageLike | null = browserStorage()) {
  if (!storage) return;
  try { storage.removeItem(LOCAL_DIAGNOSTICS_STORAGE_KEY); }
  catch { /* Optional local diagnostics must never block the application. */ }
}
