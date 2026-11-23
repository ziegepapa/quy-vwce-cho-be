// Explanations only; requests and account IDs exist solely in hashed keys.
const STORAGE = "vwce:gemini-cache:v3";
const PREFIX = "vwce:gemini-answer:v3:";
const TTL = 24 * 60 * 60 * 1000;
type Entry = { k:string; a:string; e:number; m:string };
function entries(): Entry[] {
  try {
    const x: unknown = JSON.parse(localStorage.getItem(STORAGE) || "[]");
    return Array.isArray(x) ? x.filter(v => v && typeof v.k === "string"
      && typeof v.a === "string" && v.a.length <= 800 && typeof v.e === "number"
      && (v.m === "gemini-3.5-flash-lite" || v.m === "gemini-3.8-flash")) : [];
  } catch { return []; }
}
export async function geminiAnswerCacheKey(userId: string, request: unknown): Promise<string | null> {
  try {
    const bytes = new TextEncoder().encode(JSON.stringify([userId,request,"context-v2"]));
    const hash = await crypto.subtle.digest("SHA-256",bytes);
    return PREFIX + Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2,"0")).join("");
  } catch { return null; }
}
export function readGeminiAnswer(key: string): string | null {
  if (!key.startsWith(PREFIX)) return null;
  try {
    const all = entries(), active = all.filter(x => x.e > Date.now());
    if (active.length !== all.length) localStorage.setItem(STORAGE,JSON.stringify(active));
    return active.find(x => x.k === key)?.a || null;
  } catch { return null; }
}
export function readGeminiModel(key: string): string | null {
  if (!key.startsWith(PREFIX)) return null;
  return entries().find(x => x.k === key && x.e > Date.now())?.m ?? null;
}
export function saveGeminiAnswer(key: string, answer: string, model: string): void {
  if (!key.startsWith(PREFIX) || !answer.trim() || answer.length > 800
    || (model !== "gemini-3.5-flash-lite" && model !== "gemini-3.8-flash")) return;
  try {
    const active = entries().filter(x => x.e > Date.now() && x.k !== key);
    active.push({ k:key, a:answer.trim(), e:Date.now()+TTL, m:model });
    localStorage.setItem(STORAGE,JSON.stringify(active.slice(-16)));
  } catch { /* Storage disabled or full: regular AI still works. */ }
}
export function clearGeminiAnswers(): void {
  try { localStorage.removeItem(STORAGE); localStorage.removeItem("vwce:gemini-cache:v1"); localStorage.removeItem("vwce:gemini-cache:v2"); } catch { /* Restricted storage. */ }
}
