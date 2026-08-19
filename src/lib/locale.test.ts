// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { LOCALE_KEY, persistLocale, readLocale } from "./locale";

afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-locale");
  document.documentElement.removeAttribute("lang");
});

describe("locale preference", () => {
  it("defaults to Vietnamese and persists German to the document plus local storage", () => {
    expect(readLocale()).toBe("vi");
    persistLocale("de");
    expect(readLocale()).toBe("de");
    expect(localStorage.getItem(LOCALE_KEY)).toBe("de");
    expect(document.documentElement.lang).toBe("de");
    expect(document.documentElement.dataset.locale).toBe("de");
  });
});
