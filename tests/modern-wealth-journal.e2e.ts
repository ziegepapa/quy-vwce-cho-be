import { expect, test, type Page } from "@playwright/test";
import type { Goal, Quote, Transaction } from "../src/lib/types";

const viewport = { width: 390, height: 844 };
const routes = {
  overview: ["/", ".ovb2"],
  transactions: ["/transactions", ".tx-ledger-workspace"],
  settings: ["/settings", ".set2"],
  simulation: ["/simulation", ".sim-chart-card"],
  timeline: ["/timeline", ".ct-head"],
  goals: ["/goals", ".goals-hero"],
  notfallmappe: ["/notfallmappe", ".nfm"],
} as const;
const themes = ["light", "dark", "premium"] as const;

// Isolated browser fixture. No records are added to the app's initialization.
const vwce = "IE00BK5BQT80";
const vall = "IE000VAHT5T0";
const stamp = "2026-11-19T10:00:00.000Z";
const transactions = ["2026-08-02", "2026-09-02", "2026-10-02", "2026-11-02", "2026-11-16"].map((date, index): Transaction => ({
  id: `test-buy-${index}`,
  date,
  type: index < 3 ? "buy_vwce" : "buy_security",
  instrumentIsin: index < 3 ? vwce : vall,
  amount: 120,
  quantity: index < 3 ? 1 : 30,
  unitPrice: index < 3 ? 120 : 4,
  fee: 0,
  notes: "",
  tax: 0,
  createdAt: `${date}T10:00:00.000Z`,
  updatedAt: `${date}T10:00:00.000Z`,
  source: "manual",
}));
const quotes = [
  { instrumentIsin: vwce, price: 118.69 },
  { instrumentIsin: vall, price: 235.88 / 60 },
].map(({ instrumentIsin, price }): Quote => ({
  id: `quote_${instrumentIsin}_EUR`,
  instrumentIsin,
  price,
  currency: "EUR",
  venue: "XETRA",
  asOf: "2026-11-19",
  source: "manual",
  createdAt: stamp,
  updatedAt: stamp,
}));
const goal: Goal = {
  id: "test-goal",
  name: "Mục tiêu học tập",
  dueDate: "2034-06-30",
  amount: 1000,
  mode: "nominal",
  baseYear: 2026,
  inflationRate: 0,
  bufferPct: 0,
  urgency: "hard",
  protectedAmount: 250,
  notes: "",
  createdAt: stamp,
  updatedAt: stamp,
};

async function seedLedger(page: Page) {
  await page.evaluate(({ transactions, quotes, goal }) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("quy_vwce_cho_be");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const write = db.transaction(["transactions", "quotes", "goals"], "readwrite");
      write.oncomplete = () => { db.close(); resolve(); };
      write.onabort = () => { db.close(); reject(write.error); };
      for (const transaction of transactions) write.objectStore("transactions").put(transaction);
      for (const quote of quotes) write.objectStore("quotes").put(quote);
      write.objectStore("goals").put(goal);
    };
  }), { transactions, quotes, goal });
}

async function assertFits(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width);
}

for (const theme of themes) {
  test(`Modern Wealth Journal mobile routes and ledger · ${theme}`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "mobile journal evidence is captured in Chromium");
    test.setTimeout(90_000);
    await page.setViewportSize(viewport);
    await page.clock.setFixedTime(new Date("2026-11-20T12:00:00Z"));
    await page.addInitScript((selectedTheme) => {
      localStorage.setItem("vwce-theme", selectedTheme);
      localStorage.setItem("vwce-locale", "vi");
    }, theme);
    await page.route("**/data/quotes.json", (route) => route.abort());
    await page.goto("./");
    const start = page.getByRole("button", { name: "Bắt đầu", exact: true });
    const signIn = page.getByRole("heading", { name: "Đăng nhập", exact: true });
    const noConfig = page.getByRole("heading", { name: "Chưa cấu hình đăng nhập", exact: true });
    await expect(start.or(signIn).or(noConfig)).toBeVisible();
    test.skip(!(await start.isVisible()), "requires a local-only preview build");
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(page.locator(".bottom-dock")).toHaveCount(0);
    await assertFits(page);
    await page.screenshot({ path: testInfo.outputPath("onboarding.png"), animations: "disabled" });

    await start.click();
    await expect(page.locator(".ovb2")).toBeVisible();
    await expect(page.locator(".ovb2-chart")).toHaveCount(0);
    await page.goto("./#/transactions");
    await expect(page.locator(".txv2-empty")).toBeVisible();
    await page.goto("./#/goals");
    await expect(page.getByText("Chưa có mục tiêu.")).toBeVisible();

    await seedLedger(page);
    await page.reload();
    for (const [name, [route, ready]] of Object.entries(routes)) {
      await page.goto(`./#${route}`);
      await expect(page.locator(ready)).toBeVisible();
      await expect(start).toHaveCount(0);
      await expect(page.locator(".bottom-dock a")).toHaveCount(4);
      await assertFits(page);
      if (name === "overview") {
        await expect(page.locator(".ovb2-big")).toHaveText(/591,95\s*€/);
        await expect(page.locator(".ovb2-comp .down")).toHaveText(/−8,05\s*€\s*−1,34%/);
        await expect(page.locator(".ovb2-chart")).toBeVisible();
      }
      if (name === "transactions") {
        await expect(page.locator(".tx-ledger-month-group")).toHaveCount(4);
        const november = page.locator('[data-month-key="2026-11"] .tx-ledger-row');
        await expect(november).toHaveCount(2);
        await expect(november.filter({ hasText: "VALL" })).toHaveCount(2);
        for (const month of ["08", "09", "10"]) {
          await expect(page.locator(`[data-month-key="2026-${month}"] .tx-ledger-row`)).toHaveText(/VWCE/);
        }
        await expect(page.locator(".tx-ledger-row .txv2-amt")).toHaveText(Array(5).fill(/120,00\s*€/));
      }
      if (name === "settings") {
        await expect(page.locator(".set2")).not.toContainText("2042");
      }
      if (name === "goals") {
        await expect(page.getByRole("meter")).toHaveAttribute("value", "25");
        await expect(page.locator(".mwj-goal-progress strong")).toHaveText(/250,00\s*€/);
      }
      if (name === "simulation") {
        await page.getByRole("button", { name: "Thử ví dụ từ 0 €" }).click();
        const monthlyRate = 1.05 ** (1 / 12) - 1;
        const yearGrowth = (1 + monthlyRate) ** 12;
        const afterTer = 1 - 0.0014;
        const annualContributions = 120 * (yearGrowth - 1) / monthlyRate * afterTer;
        const annualFactor = yearGrowth * afterTer;
        const projected = annualContributions * (annualFactor ** 30 - 1) / (annualFactor - 1);
        const rounded = (value: number) => Math.round(value).toLocaleString("vi-VN");
        await expect(page.getByTestId("simulation-hero-amount")).toContainText(rounded(projected));
        await expect(page.locator(".summary-strip")).toContainText(rounded(120 * 12 * 30));
        await expect(page.locator(".summary-strip")).toContainText(rounded(projected - 120 * 12 * 30));
        await expect(page.getByTestId("simulation-growth-chart").locator("svg")).toBeVisible();
      }
      await page.screenshot({ path: testInfo.outputPath(`${name}.png`), animations: "disabled" });
      if (name === "simulation") {
        await page.getByRole("button", { name: "Điều chỉnh giả định" }).click();
        await expect(page.locator(".bottom-dock")).toBeHidden();
        await page.locator("details", { has: page.locator("#sim-starting-balance") }).locator("summary").click();
        await expect(page.locator("#sim-starting-balance")).toHaveValue("0");
        await page.getByRole("button", { name: "Đóng", exact: true }).click();
        await expect(page.locator(".bottom-dock")).toBeVisible();
      }
    }
  });
}
