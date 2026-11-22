import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearGeminiAnswers, geminiAnswerCacheKey, readGeminiAnswer, saveGeminiAnswer } from "./geminiVaultCache";

class FakeStorage {
  private values = new Map<string,string>();
  get length() { return this.values.size; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}
const prefix = "vwce:gemini-answer:v1:";
let store: FakeStorage;

beforeEach(() => {
  store = new FakeStorage();
  vi.stubGlobal("localStorage", store);
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("Gemini answer cache privacy and quota avoidance", () => {
  it("hashes authenticated user and full request, never stores raw monetary facts in the key", async () => {
    const req = {schemaVersion:1,locale:"vi",topic:"plan",queryYear:null,
      facts:{contributed:560, portfolioValue:521.97, monthly:120}};
    const a = await geminiAnswerCacheKey("user-A", req);
    const same = await geminiAnswerCacheKey("user-A", req);
    const changed = await geminiAnswerCacheKey("user-A", {
      ...req, facts:{...req.facts,portfolioValue:522.01},
    });
    const userB = await geminiAnswerCacheKey("user-B", req);
    expect(a).toBe(same);
    expect(a).toMatch(/^vwce:gemini-answer:v1:[a-f0-9]{64}$/);
    expect(a).not.toContain("560");
    expect(a).not.toContain("user-A");
    expect(changed).not.toBe(a);
    expect(userB).not.toBe(a);
  });

  it("reuses successful explanation then expires after 24 hours", () => {
    const key = prefix + "example";
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-22T12:00:00Z"));
    saveGeminiAnswer(key,"Số liệu được giải thích.");
    expect(readGeminiAnswer(key)).toBe("Số liệu được giải thích.");
    vi.setSystemTime(new Date("2026-11-23T12:00:01Z"));
    expect(readGeminiAnswer(key)).toBeNull();
    expect(store.getItem(key)).toBeNull();
  });

  it("does not cache failed responses, unrelated storage, or oversized output", () => {
    saveGeminiAnswer(prefix + "bad", "");
    saveGeminiAnswer(prefix + "oversized", "x".repeat(801));
    saveGeminiAnswer("other-app:1","should-not-store");
    expect(store.length).toBe(0);
    store.setItem("vault:unrelated","keep me");
    clearGeminiAnswers();
    expect(store.getItem("vault:unrelated")).toBe("keep me");
  });

  it("limits entries and clears only Gemini responses", () => {
    store.setItem("vault:unrelated", "keep");
    for (let i=0;i<24;i++) saveGeminiAnswer(prefix + i, "Safe explanation");
    expect(store.length).toBe(2);
    expect(JSON.parse(store.getItem("vwce:gemini-cache:v1") || "[]")).toHaveLength(16);
    clearGeminiAnswers();
    expect(store.length).toBe(1);
    expect(store.getItem("vault:unrelated")).toBe("keep");
  });

  it("fails safely when storage or crypto is unavailable", async () => {
    vi.stubGlobal("crypto", {});
    expect(await geminiAnswerCacheKey("user", {topic:"plan"})).toBeNull();
    vi.stubGlobal("localStorage", { getItem() {throw new Error("blocked");}, setItem(){throw new Error("blocked");} });
    expect(readGeminiAnswer(prefix + "test")).toBeNull();
    expect(() => saveGeminiAnswer(prefix + "test", "Answer")).not.toThrow();
  });
});
