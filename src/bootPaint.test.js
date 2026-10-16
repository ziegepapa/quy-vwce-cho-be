import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolve } from "node:path";

const indexHtml = readFileSync(resolve("index.html"), "utf8");
const app = readFileSync(resolve("src/App.tsx"), "utf8");
const viteConfig = readFileSync(resolve("vite.config.ts"), "utf8");

describe("boot paint regression", () => {
  it("paints the app background inline before CSS/JS load", () => {
    // Không còn canvas đen mặc định của trình duyệt trước khi CSS tải.
    expect(indexHtml).toMatch(/html,\s*body\s*\{\s*background:\s*#06060a/);
  });
  it("renders loading states inside app-layout so the glow shows while loading", () => {
    expect(app).toMatch(/function RouteLoading[\s\S]*?className="app-layout"/);
    expect(app).not.toMatch(
      /return <div className="app-shell"><p className="muted">\{text\.loading\}<\/p><\/div>/,
    );
  });
  it("matches the PWA splash background to the app background", () => {
    expect(viteConfig).toMatch(/background_color:\s*"#06060a"/);
  });
});
