// Short-lived, device-only cache. Keys hash user + fixed request fields; values
// contain only the validated Gemini explanation (never raw facts or credentials).
const PREFIX = "vwce:gemini-answer:v1:";
const TTL = 24 * 60 * 60 * 1000;
const MAX = 16;

export async function geminiAnswerCacheKey(userId: string, request: unknown): Promise<string | null> {
  try {
    const bytes = new TextEncoder().encode(JSON.stringify([userId, request]));
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return PREFIX + Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
  } catch { return null; } // In restricted browser contexts, fall back to uncached AI.
}

export function readGeminiAnswer(key: string): string | null {
  if (!key.startsWith(PREFIX)) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const item: unknown = JSON.parse(raw);
    if (item && typeof item === "object" && "answer" in item && "expires" in item
      && typeof item.answer === "string" && item.answer.length > 0 && item.answer.length <= 800
      && typeof item.expires === "number" && item.expires > Date.now()) return item.answer;
    localStorage.removeItem(key);
  } catch { /* Storage may be blocked. */ }
  return null;
}

export function saveGeminiAnswer(key: string, answer: string): void {
  if (!key.startsWith(PREFIX) || !answer.trim() || answer.length > 800) return;
  try {
    localStorage.setItem(key, JSON.stringify({ answer:answer.trim(), expires:Date.now() + TTL }));
    const keys = Array.from({ length:localStorage.length }, (_, i) => localStorage.key(i))
      .filter((k): k is string => !!k?.startsWith(PREFIX));
    for (const k of keys) readGeminiAnswer(k); // Delete expired/invalid entries.
    const remaining = keys.filter(k => localStorage.getItem(k)).sort((a,b) => {
      const age = (k: string) => {
        try { return Number(JSON.parse(localStorage.getItem(k) || "{}").expires) || 0; }
        catch { return 0; }
      };
      return age(a) - age(b);
    });
    for (const k of remaining.slice(0, Math.max(0, remaining.length - MAX))) localStorage.removeItem(k);
  } catch { /* Quota or private browsing: do not block the answer. */ }
}

export function clearGeminiAnswers(): void {
  try {
    for (const k of Array.from({ length:localStorage.length }, (_, i) => localStorage.key(i))) {
      if (k?.startsWith(PREFIX)) localStorage.removeItem(k);
    }
  } catch { /* No storage access. */ }
}
