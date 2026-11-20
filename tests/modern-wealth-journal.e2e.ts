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
  createdAt: index === 4 ? stamp : `${date}T10:00:00.000Z`,
  updatedAt: index === 4 ? stamp : `${date}T10:00:00.000Z`,
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

async function seedLedger(page: Page, ledger = transactions) {
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
  }), { transactions: ledger, quotes, goal });
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
    await page.route("**/data/price-history/*.json", (route) => route.fulfill({
      json: {
        points: route.request().url().endsWith(`${vwce}.json`) ? [
          { date: "2026-08-31", price: 118 },
          { date: "2026-10-30", price: 119 },
        ] : [],
      },
    }));
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
      await expect(page.locator(".bottom-dock .pb")).toHaveCount(4);
      await expect(page.locator(".bottom-dock")).toContainText("Tổng quan");
      await expect(page.locator(".bottom-dock")).toContainText("Dòng thời gian");
      await expect(page.locator(".bottom-dock")).toContainText("Thêm");
      await assertFits(page);
      if (name === "overview") {
        await expect(page.locator(".ovb2-big")).toHaveText(/591,95\s*€/);
        await expect(page.locator(".mwj-hero-pill")).toHaveText(/−8,05\s*€\s*−1,34%/);
        await expect(page.locator(".mwj-hero-hello")).toHaveText(/Chào buổi chiều/);
        await expect(page.locator(".mwj-hero-sub")).toHaveText("Quỹ VWCE cho bé");
        await expect(page.locator(".mwj-hero-bell")).toHaveAttribute("href", "#/timeline");
        const stats = page.locator(".mwj-portfolio-stats");
        await expect(stats).toContainText(/Bạn đã góp\s*600,00\s*€/);
        await expect(stats).toContainText(/Giá trị hiện tại\s*591,95\s*€/);
        await expect(stats).toContainText(/Lãi \/ lỗ thực\s*−8,05\s*€/);
        const chart = page.locator(".ovb2-chart");
        await expect(chart).toBeVisible();
        // September has only a carry-forward price. August remains an isolated point.
        // Dots mark every drawn segment end, including a resumed segment's start (October).
        await expect(chart.locator("[data-month]")).toHaveCount(3);
        await expect(chart.locator('[data-month="2026-08"]')).toHaveCount(1);
        await expect(chart.locator('[data-month="2026-10"]')).toHaveCount(1);
        await expect(chart.locator('[data-month="2026-11"]')).toHaveCount(1);
        await expect(chart.locator('[data-series="portfolio-value"]')).toHaveAttribute("d", /^M[0-9.,]+ L[0-9.,]+$/);
        await expect(page.getByText(/Khoảng trống trên đường giá trị/)).toBeVisible();
      }
      if (name === "transactions") {
        await expect(page.locator(".tx-ledger-month-group")).toHaveCount(4);
        const firstRow = await page.locator(".tx-ledger-row").first().boundingBox();
        expect(firstRow!.y + firstRow!.height).toBeLessThan(520);
        const activity = page.getByRole("group", { name: "Dòng tiền" });
        await expect(activity.getByRole("button", { name: "Chi ra" })).toBeInViewport();
        const search = page.getByRole("textbox", { name: "Tìm kiếm giao dịch" });
        await search.fill("a".repeat(100));
        const chip = page.locator(".tx-active-filter-chips button");
        await expect(chip).toBeVisible();
        expect(await chip.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
        await assertFits(page);
        await chip.click();
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
      if (name === "timeline") {
        const journey = page.getByRole("region", { name: "Hành trình đầu tư" });
        await expect(journey.getByText("Mua VALL")).toHaveCount(2);
        await expect(journey.getByText("Mua VWCE")).toHaveCount(3);
        await expect(journey.locator(".ct-trade-day time")).toHaveText([
          "16/11/2026", "02/11/2026", "02/10/2026", "02/09/2026", "02/08/2026",
        ]);
        await expect(journey.locator(".ct-event-value")).toHaveText(Array(5).fill(/120,00\s*€/));
      }
      if (name === "notfallmappe") {
        await expect(page.locator(".nfm-snap-v")).toHaveText([/591,95\s*€/, "3", /118,69\s*€/, "5"]);
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
        const chart = page.getByTestId("simulation-growth-chart");
        await expect(chart.locator(".sim-chart-values strong")).toContainText(rounded(projected));
        await expect(chart.locator("svg")).toBeVisible();
        expect(await chart.locator("svg").evaluate((svg) => {
          const { width, height } = (svg as SVGSVGElement).viewBox.baseVal;
          return [...svg.querySelectorAll("text")].every((label) => {
            const { x, y, width: labelWidth, height: labelHeight } = label.getBBox();
            return x >= 0 && y >= 0 && x + labelWidth <= width && y + labelHeight <= height;
          });
        })).toBe(true);
      }
      await page.screenshot({ path: testInfo.outputPath(`${name}.png`), animations: "disabled" });
      if (name === "overview") {
        await page.locator(".ovb2-chart-card").scrollIntoViewIfNeeded();
        await page.screenshot({ path: testInfo.outputPath("overview-chart.png"), animations: "disabled" });
        await page.locator(".ovb2-hero").scrollIntoViewIfNeeded();
        await page.getByRole("button", { name: "Thêm", exact: true }).click();
        const sheet = page.getByRole("dialog", { name: "Thêm" });
        await expect(sheet.getByRole("link", { name: "Mô phỏng" })).toBeVisible();
        await expect(sheet.getByRole("link", { name: "Mục tiêu" })).toBeVisible();
        await expect(sheet.getByRole("link", { name: "Hồ sơ khẩn cấp" })).toBeVisible();
        await expect(sheet.getByRole("link", { name: "Cài đặt" })).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(sheet).toHaveCount(0);
      }
      if (name === "timeline") {
        const confidence = page.locator(".ct-confidence");
        await confidence.locator("summary").first().click();
        await expect(confidence.getByText("Snapshot giá · VWCE")).toBeVisible();
        await expect(confidence.locator(".ct-day").first()).toHaveAttribute("open", "");
      }
      if (name === "goals") {
        await page.locator(".mwj-goal-entry button").first().click();
        await page.getByText("Sửa", { exact: true }).click();
        await expect(page.locator("#g-prot")).toHaveValue("250");
        await page.locator("#g-name").fill("Mục tiêu học tập mới");
        await page.getByRole("button", { name: "Lưu", exact: true }).click();
        const savedGoal = page.getByRole("heading", { name: "Mục tiêu học tập mới" });
        await expect(savedGoal).toBeVisible();
        await page.reload();
        await expect(savedGoal).toBeVisible();
        await expect(page.getByRole("meter")).toHaveAttribute("value", "25");
      }
      if (name === "settings") {
        const trigger = page.getByRole("button", { name: /Xóa toàn bộ dữ liệu trên thiết bị/ });
        await trigger.click();
        const token = page.getByLabel(/Gõ XOA để xác nhận/);
        const confirm = page.getByRole("button", { name: "Xác nhận xóa" });
        await expect(token).toBeFocused();
        await expect(confirm).toBeDisabled();
        await token.fill("XO");
        await expect(confirm).toBeDisabled();
        await token.fill("XOA");
        await expect(confirm).toBeEnabled();
        await page.screenshot({ path: testInfo.outputPath("settings-delete.png"), animations: "disabled" });
        await token.press("Escape");
        await expect(trigger).toBeFocused();
        await trigger.click();
        await expect(token).toHaveValue("");
        await page.getByRole("button", { name: "Hủy", exact: true }).click();
        await expect(confirm).toHaveCount(0);
      }
      if (name === "notfallmappe") {
        await page.locator(".nfm-sec-static").evaluate((section) => section.scrollIntoView({ block: "center" }));
        await page.screenshot({ path: testInfo.outputPath("notfallmappe-assets.png"), animations: "disabled" });
        await page.evaluate(() => {
          const observer = new MutationObserver(() => {
            const frame = document.querySelector<HTMLIFrameElement>('iframe[aria-hidden="true"]');
            if (!frame?.contentWindow) return;
            frame.contentWindow.print = () => {
              frame.dataset.printCalled = "true";
            };
            observer.disconnect();
          });
          observer.observe(document.body, { childList: true });
        });
        await page.getByRole("button", { name: "In / Lưu PDF" }).click();
        await expect(page.locator('iframe[data-print-called="true"]')).toHaveCount(1);
        const printed = page.frameLocator('iframe[data-print-called="true"]');
        await expect(printed.locator(".nfm-snap-v")).toHaveText([/591,95\s*€/, "3", /118,69\s*€/, "5"]);
        await expect(printed.locator("input, textarea, details")).toHaveCount(0);
        const printHtml = await printed.locator("html").evaluate((html) => html.outerHTML);
        const printPage = await page.context().newPage();
        await printPage.setContent(`<!doctype html>${printHtml}`);
        await printPage.pdf({ path: testInfo.outputPath("notfallmappe.pdf"), preferCSSPageSize: true });
        await printPage.close();
      }
      if (name === "simulation") {
        await page.getByTestId("simulation-growth-chart").evaluate((chart) => chart.scrollIntoView({ block: "center" }));
        await page.screenshot({ path: testInfo.outputPath("simulation-chart.png"), animations: "disabled" });
        await page.getByRole("button", { name: "Điều chỉnh giả định" }).click();
        await expect(page.locator(".bottom-dock")).toBeHidden();
        await page.locator("details", { has: page.locator("#sim-starting-balance") }).locator("summary").click();
        await expect(page.locator("#sim-starting-balance")).toHaveValue("0");
        await page.getByRole("button", { name: "Đóng", exact: true }).click();
        await expect(page.locator(".bottom-dock")).toBeVisible();
      }
    }

    const olderTrades = Array.from({ length: 8 }, (_, index): Transaction => ({
      ...transactions[0],
      id: `test-older-${index}`,
      date: `${2018 + index}-08-02`,
    }));
    await seedLedger(page, [...olderTrades, { ...transactions[4], id: "test-same-day" }]);
    await page.goto("./#/transactions");
    const years = page.getByRole("tablist", { name: "Chọn năm xem" });
    await expect(page.getByText("↔ Cuộn ngang để xem thêm")).toBeVisible();
    await assertFits(page);
    await page.screenshot({ path: testInfo.outputPath("transactions-years.png"), animations: "disabled" });
    const oldest = years.getByRole("tab", { name: "2018" });
    await oldest.focus();
    await expect.poll(() => years.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
    await oldest.press("Enter");
    await expect(oldest).toHaveAttribute("aria-selected", "true");
    await expect(page.locator(".tx-ledger-row")).toHaveCount(1);
    await page.goto("./#/timeline");
    const sameDay = page.locator(".ct-trade-day").filter({ has: page.locator('time[datetime="2026-11-16"]') });
    await expect(sameDay).toHaveCount(1);
    await expect(sameDay.getByText("Mua VALL")).toHaveCount(2);
  });
}
