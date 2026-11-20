import { writeFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import type { Quote, Transaction } from "../src/lib/types";

const vwce = "IE00BK5BQT80";
const vall = "IE000VAHT5T0";
const stamp = "2026-11-19T10:00:00.000Z";

// EUR closes from public/data at f8ad146. The November purchases are separate orders on one trading day.
const trades = [
  { date: "2026-08-03", price: 164.36, isin: vwce },
  { date: "2026-09-10", price: 165.26, isin: vwce },
  { date: "2026-10-26", price: 170, isin: vwce },
  { date: "2026-11-19", price: 4.1985, isin: vall },
  { date: "2026-11-19", price: 4.1985, isin: vall },
];

const transactions = trades.map(({ date, price, isin }, index): Transaction => ({
  id: `overview-visual-buy-${index}`,
  date,
  type: isin === vwce ? "buy_vwce" : "buy_security",
  instrumentIsin: isin,
  amount: 120,
  quantity: 120 / price,
  unitPrice: price,
  fee: 0,
  tax: 0,
  notes: "",
  createdAt: `${date}T10:00:00.000Z`,
  updatedAt: `${date}T10:00:00.000Z`,
  source: "manual",
}));
const quotes = [
  { instrumentIsin: vwce, price: 162.78 },
  { instrumentIsin: vall, price: 4.1985 },
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
const vwceHistory = [
  { date: "2026-08-31", price: 166.66 },
  { date: "2026-09-30", price: 169.78 },
  { date: "2026-10-30", price: 168.9 },
  { date: "2026-11-19", price: 162.78 },
];

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block", timezoneId: "Europe/Berlin" });

async function openLocalOverview(page: Page, theme: string, withGap = false) {
  await page.clock.setFixedTime(new Date("2026-11-20T08:41:00Z"));
  await page.addInitScript((selectedTheme) => {
    localStorage.setItem("vwce-theme", selectedTheme);
    localStorage.setItem("vwce-locale", "de");
  }, theme);
  await page.route("**/data/quotes.json", (route) => route.abort());
  await page.route("**/data/price-history/*.json", (route) => route.fulfill({
    json: {
      points: route.request().url().endsWith(`${vwce}.json`)
        ? vwceHistory.filter((point) => !withGap || point.date !== "2026-09-30")
        : [{ date: "2026-11-19", price: 4.1985 }],
    },
  }));
  await page.goto("./");
  const start = page.getByRole("button", { name: "Starten", exact: true });
  const auth = page.getByRole("heading", { name: /^(Anmelden|Anmeldung nicht konfiguriert)$/ });
  await expect(start.or(auth)).toBeVisible();
  test.skip(!(await start.isVisible()), "requires a local-only preview build");
  await start.click();
  await expect(page.locator(".ovb2-chart-empty")).toBeVisible();
}

async function seedOverview(page: Page, withQuotes = true) {
  await page.evaluate(({ transactions, quotes }) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("quy_vwce_cho_be");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const write = database.transaction(["transactions", "quotes", "settings"], "readwrite");
      write.oncomplete = () => { database.close(); resolve(); };
      write.onabort = () => { database.close(); reject(write.error); };
      for (const transaction of transactions) write.objectStore("transactions").put(transaction);
      for (const quote of quotes) write.objectStore("quotes").put(quote);
      const settings = write.objectStore("settings");
      const readSettings = settings.get("settings");
      readSettings.onsuccess = () => settings.put({ ...readSettings.result, planName: "Der Fonds für unseren Sohn" });
    };
  }), { transactions, quotes: withQuotes ? quotes : [] });
  await page.reload();
}

for (const theme of ["light", "dark", "premium"]) {
  test(`Overview layout and scroll · ${theme}`, async ({ page }, testInfo) => {
    await openLocalOverview(page, theme);
    await expect(page.locator(".ovb2-chart")).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("overview-empty.png") });
    await seedOverview(page);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(page.locator(".ovb2-big")).toHaveText("591,95 €");
    await expect(page.locator(".ovb2-pnl-pill")).toHaveText("−8,05 € −1,34%");
    await expect(page.locator(".mwj-portfolio-stats dd")).toHaveText(["600,00 €", "591,95 €", "−8,05 €"]);
    await expect(page.locator(".ovb2-chart [data-series=portfolio-value]")).toHaveAttribute("d", /^M[0-9.,]+( L[0-9.,]+){3}$/);
    await expect(page.locator(".ovb2-chart-gaps")).toHaveCount(0);

    const layout = await page.evaluate(() => Object.fromEntries(
      [".bar", ".ovb2-hero", ".ovb2-k", ".ovb2-big", ".ovb2-pnl-pill", ".mwj-portfolio-stats", ".ovb2-chart-card", ".ovb2-chart", ".bottom-dock"].map((selector) => {
        const element = document.querySelector(selector)!;
        const box = element.getBoundingClientRect();
        return [selector, { x: box.x, y: box.y, width: box.width, height: box.height, font: getComputedStyle(element).fontSize }];
      }),
    ));
    expect(layout[".ovb2-chart-card"].y + layout[".ovb2-chart-card"].height).toBeLessThanOrEqual(layout[".bottom-dock"].y);
    await writeFile(testInfo.outputPath("overview-layout.json"), JSON.stringify(layout, null, 2));
    await page.screenshot({ path: testInfo.outputPath("overview.png"), animations: "disabled" });

    await page.locator(".ovb2-chart-info summary").click();
    await expect(page.locator(".ovb2-chart-info p")).toBeVisible();
    await page.locator(".ovb2-chart-info summary").click();

    const viewport = page.locator(".mwj-overview-layout > .app-shell");
    const dockTop = layout[".bottom-dock"].y;
    expect((await viewport.boundingBox())!.height).toBe(dockTop);

    await page.locator(".ovb2-table-card").evaluate((el) => el.scrollIntoView({ block: "center" }));
    await expect(page.locator(".ovb2-table-card")).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath("overview-scroll.png"), animations: "disabled" });
    await viewport.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await expect.poll(() => viewport.evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop)).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    expect((await page.locator(".bottom-dock").boundingBox())!.y).toBe(dockTop);
    const footerLink = page.locator(".ovb2-updates a");
    await expect(footerLink).toBeInViewport();
    expect((await footerLink.boundingBox())!.y + (await footerLink.boundingBox())!.height).toBeLessThan(layout[".bottom-dock"].y);

    await page.screenshot({ path: testInfo.outputPath("overview-bottom.png"), animations: "disabled" });

    const dock = page.getByRole("navigation", { name: "Hauptnavigation" });
    const more = dock.getByRole("button", { name: "Mehr" });
    await more.click();
    const extraRoutes = page.getByRole("dialog", { name: "Mehr" });
    for (const name of ["Simulation", "Ziele", "Notfallmappe", "Einstellungen"]) {
      await expect(extraRoutes.getByRole("link", { name, exact: false })).toBeVisible();
    }
    await page.screenshot({ path: testInfo.outputPath("overview-more.png"), animations: "disabled" });
    await page.keyboard.press("Escape");
    await expect(extraRoutes).toBeHidden();

    await page.setViewportSize({ width: 320, height: 640 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
    await viewport.evaluate((el) => el.scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath("overview-320.png"), animations: "disabled" });
    await more.click();
    await extraRoutes.getByRole("link", { name: "Simulation" }).click();
    await expect(page).toHaveURL(/#\/simulation$/);
    await expect(extraRoutes).toBeHidden();
    await dock.getByRole("link", { name: "Timeline" }).click();
    await expect(page).toHaveURL(/#\/timeline$/);
  });
}

test("Overview shows a valuation gap and keeps contributions visible", async ({ page }, testInfo) => {
  await openLocalOverview(page, "light", true);
  await seedOverview(page, false);
  await expect(page.getByText("Bewertetes Vermögen")).toBeVisible();
  await expect(page.locator(".ovb2-pnl-pill")).toHaveCount(0);
  await expect(page.locator(".mwj-portfolio-stats dd")).toHaveText(["600,00 €", "—", "Noch nicht bewertbar"]);
  await expect(page.locator(".ovb2-chart-gaps")).toBeVisible();
  const chart = page.locator(".ovb2-chart");
  await expect(chart.locator("[data-series=contributions]")).toHaveAttribute("d", /^M[0-9.,]+( L[0-9.,]+){3}$/);
  await expect(chart.locator("[data-series=portfolio-value]")).toHaveAttribute("d", /^M[0-9.,]+ L[0-9.,]+$/);
  await expect(chart.locator("[data-month='2026-08']")).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath("overview-gap.png"), animations: "disabled" });
});
