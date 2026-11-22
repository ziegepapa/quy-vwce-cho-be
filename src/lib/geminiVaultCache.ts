// Cache only validated text. The key hashes the signed-in user and complete
// normalized request; no question, portfolio amount or secret is stored directly.
const PREFIX = "vwce:gemini-answer:v1:";
const TTL = 24 * 60 * 60 * 1000;
const MAX = 16;
const keys = (): string[] => Array.from({length:localStorage.length},
  (_,i) => localStorage.key(i)).filter((x):x is string => !!x?.startsWith(PREFIX));

export async function geminiAnswerCacheKey(userId: string, request: unknown): Promise<string | null> {
  try {
    const bytes = new TextEncoder().encode(JSON.stringify([userId,request]));
    const digest = await crypto.subtle.digest("SHA-256",bytes);
    return PREFIX + Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2,"0")).join("");
  } catch { return null; } // Unavailable crypto => no cache.
}
export function readGeminiAnswer(key: string): string | null {
  if (!key.startsWith(PREFIX)) return null;
  try {
    const entry = JSON.parse(localStorage.getItem(key) || "null");
    if (typeof entry?.a === "string" && entry.a.length > 0 && entry.a.length <= 800
      && typeof entry.e === "number" && entry.e > Date.now()) return entry.a;
    localStorage.removeItem(key);
  } catch { /* Storage unavailable. */ }
  return null;
}
export function saveGeminiAnswer(key: string, answer: string): void {
  if (!key.startsWith(PREFIX) || !answer.trim() || answer.length > 800) return;
  try {
    localStorage.setItem(key,JSON.stringify({a:answer.trim(),e:Date.now()+TTL}));
    keys().forEach(readGeminiAnswer); // Remove expired entries.
    const active = keys();
    active.slice(0,Math.max(0,active.length-MAX)).forEach(k=>localStorage.removeItem(k));
  } catch { /* Browser quota/private mode => skip cache. */ }
}
export function clearGeminiAnswers(): void {
  try { keys().forEach(k=>localStorage.removeItem(k)); } catch { /* No storage. */ }
}
