import { expect, test, type Page, type TestInfo } from "@playwright/test";

const localOrigin = "http://127.0.0.1:4173";
const appPath = "/quy-vwce-cho-be/";
const iphone13Viewport = { width: 390, height: 844 };

type PreviewLocale = "vi" | "de";

function entryCopy(locale: PreviewLocale) {
  return locale === "de" ? {
    start: "Starten",
    tagline: "Dein Vermögen. Klar im Blick.",
    login: "Anmelden",
    missingConfig: "Anmeldung nicht konfiguriert",
    overview: "Übersicht",
  } : {
    start: "Bắt đầu",
    tagline: "Tài sản của bạn. Luôn rõ ràng.",
    login: "Đăng nhập",
    missingConfig: "Chưa cấu hình đăng nhập",
    overview: "Tổng quan",
  };
}

async function openPrivateVaultEntry(page: Page, locale: PreviewLocale = "vi") {
  const copy = entryCopy(locale);
  await page.addInitScript((nextLocale) => window.localStorage.setItem("vwce-locale", nextLocale), locale);
  const response = await page.goto("./", { waitUntil: "domcontentloaded" });
  expect(response?.ok()).toBe(true);
  await expect(page.locator("#root > *").first()).toBeVisible();

  const startButton = page.getByRole("button", { name: copy.start, exact: true });
  const loginHeading = page.getByRole("heading", { name: copy.login, exact: true });
  const missingConfigHeading = page.getByRole("heading", {
    name: copy.missingConfig,
    exact: true,
  });
  const authEntryHeading = loginHeading.or(missingConfigHeading);
  const localVaultEntry = page.getByRole("link", { name: copy.overview, exact: true }).first();
  const supportedEntry = authEntryHeading.or(localVaultEntry);

  await expect(startButton.or(supportedEntry)).toBeVisible();
  if (await startButton.isVisible()) {
    await expect(page.getByRole("heading", { name: copy.tagline })).toBeVisible();
    await startButton.click();
  }
  await expect(supportedEntry).toBeVisible();

  return { loginHeading, missingConfigHeading, localVaultEntry };
}

async function captureVisualEvidence(page: Page, testInfo: TestInfo, fileName: string) {
  await openPrivateVaultEntry(page);
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    )
    .toBe(true);
  await page.screenshot({
    path: testInfo.outputPath(fileName),
    fullPage: true,
    animations: "disabled",
  });
}

test("production build boots in an isolated browser environment", async ({ page }) => {
  const pageErrors: string[] = [];
  const failedLocalRequests: string[] = [];

  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => {
    const url = new URL(request.url());
    if (url.origin === localOrigin && url.pathname.startsWith(appPath)) {
      failedLocalRequests.push(`${request.method()} ${url.pathname}`);
    }
  });

  const response = await page.goto("./", { waitUntil: "domcontentloaded" });
  expect(response?.ok()).toBe(true);
  await expect(page.locator("#root > *").first()).toBeVisible();
  await page.waitForTimeout(1_000);

  expect(pageErrors).toEqual([]);
  expect(failedLocalRequests).toEqual([]);
});

test("private-vault entry point remains usable", async ({ page }) => {
  const { loginHeading, missingConfigHeading, localVaultEntry } = await openPrivateVaultEntry(page);

  if (await loginHeading.isVisible()) {
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Mật khẩu")).toBeVisible();
    await expect(page.getByText("Tối thiểu 14 ký tự")).toBeVisible();
    await expect(page.getByText(/Vault riêng tư/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Đăng nhập", exact: true })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Tạo tài khoản mới" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Quên mật khẩu?" })).toBeVisible();
  } else if (await missingConfigHeading.isVisible()) {
    await expect(missingConfigHeading).toBeVisible();
    await expect(page.getByText("VITE_SUPABASE_URL")).toBeVisible();
    await expect(page.getByText("VITE_SUPABASE_ANON_KEY")).toBeVisible();
  } else {
    await expect(localVaultEntry).toBeVisible();
    await expect(page.getByRole("link", { name: "Giao dịch", exact: true }).first()).toBeVisible();
  }
});

test("German private-vault entry remains locale-pure and keyboard reachable", async ({ page }) => {
  const { loginHeading, missingConfigHeading, localVaultEntry } = await openPrivateVaultEntry(page, "de");

  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  if (await loginHeading.isVisible()) {
    await expect(page.getByText("Privater Vault. Neue Konten werden ausschließlich vom Owner angelegt und bestätigt.")).toBeVisible();
    await expect(page.locator("#email")).toBeVisible();
    await page.locator("#email").focus();
    await page.keyboard.press("Tab");
    await expect(page.locator("#password")).toBeFocused();
    await expect(page.getByRole("button", { name: "Passwort vergessen?", exact: true })).toBeVisible();
    await expect(page.getByText("Vault riêng tư")).toHaveCount(0);
    await expect(page.getByText("Đăng nhập", { exact: true })).toHaveCount(0);
  } else if (await missingConfigHeading.isVisible()) {
    await expect(missingConfigHeading).toBeVisible();
    await expect(page.getByText("Chưa cấu hình đăng nhập", { exact: true })).toHaveCount(0);
  } else {
    await expect(localVaultEntry).toBeVisible();
    await expect(page.getByRole("link", { name: "Transaktionen", exact: true }).first()).toBeVisible();
  }
});

test("mobile local-vault routes keep primary controls reachable without horizontal overflow", async ({ page }) => {
  await page.setViewportSize(iphone13Viewport);
  const { localVaultEntry } = await openPrivateVaultEntry(page);
  test.skip(!(await localVaultEntry.isVisible()), "requires the local-only preview entry");

  for (const route of ["./", "./#/transactions", "./#/settings"]) {
    await page.goto(route, { waitUntil: "networkidle" });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const dockHeights = await page.locator(".bottom-dock .pb").evaluateAll((links) => links.map((link) => Math.round(link.getBoundingClientRect().height)));
    expect(dockHeights).toHaveLength(4);
    expect(dockHeights.every((height) => height >= 44)).toBe(true);
  }

});

test("mobile Transactions keeps PDF import reachable above the dock", async ({ page }) => {
  await page.setViewportSize(iphone13Viewport);
  const { localVaultEntry } = await openPrivateVaultEntry(page);
  test.skip(!(await localVaultEntry.isVisible()), "requires the local-only preview entry");

  await page.goto("./#/transactions", { waitUntil: "networkidle" });
  const importSummary = page.locator(".tx-import-tools > summary");
  await expect(importSummary).toBeVisible();
  await importSummary.click();

  const importButton = page.getByRole("button", { name: "Nhập hóa đơn hoặc sao kê Depot", exact: true });
  await expect(importButton).toBeVisible();
  await expect(page.locator(".bottom-dock")).toHaveClass(/is-hidden/);
  await expect.poll(() => page.evaluate(() => {
    const button = document.querySelector(".import-review > button") as HTMLElement | null;
    const dock = document.querySelector(".bottom-dock") as HTMLElement | null;
    if (!button) return false;
    const rect = button.getBoundingClientRect();
    if (rect.top < 0 || rect.bottom > window.innerHeight) return false;
    if (!dock) return true;
    const dockRect = dock.getBoundingClientRect();
    return dock.classList.contains("is-hidden") || rect.bottom < dockRect.top - 8;
  })).toBe(true);

  await importSummary.click();
});

test("mobile Settings keeps P40 plan mechanics in a sheet and all tab actions reachable without overflow", async ({ page }) => {
  await page.setViewportSize(iphone13Viewport);
  const { localVaultEntry } = await openPrivateVaultEntry(page);
  test.skip(!(await localVaultEntry.isVisible()), "requires the local-only preview entry");

  await page.goto("./#/settings", { waitUntil: "networkidle" });
  // The tabbed Settings UI is gone: Settings is now a set2 list whose rows
  // open sheets. The list itself shows the plan group with no editable
  // fields and no raw decimal rates leaking through.
  await expect(page.locator(".set2")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Cài đặt", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "KẾ HOẠCH", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Mục tiêu/ }).first()).toBeVisible();
  await expect(page.locator(".set2 input, .set2 select")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  // Former tab bar (3 tabs x 44px): every list row is now a >=44px touch target.
  const rowHeights = await page.locator(".set2-row").evaluateAll((rows) => rows.map((row) => Math.round(row.getBoundingClientRect().height)));
  expect(rowHeights.length).toBeGreaterThan(0);
  expect(rowHeights.every((height) => height >= 44)).toBe(true);

  // Former "Chung" tab + "Thêm mục tiêu / Tùy chỉnh kế hoạch" action:
  // the "Mục tiêu" row opens the plan sheet (dialog titled "Mục tiêu").
  await page.getByRole("button", { name: /Mục tiêu/ }).first().click();
  const planDialog = page.getByRole("dialog", { name: "Mục tiêu" });
  await expect(planDialog).toBeVisible();
  await expect(planDialog.getByRole("button", { name: "3 năm" })).toBeVisible();
  await expect(planDialog.getByRole("button", { name: "5 năm" })).toBeVisible();
  await expect(planDialog.getByRole("button", { name: "7 năm" })).toBeVisible();
  await expect(planDialog).not.toContainText("0.05");
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  // Former "Nâng cao cho mô phỏng" flow: the plan sheet's advanced link
  // opens the "Giả định mô phỏng" sheet with three %/năm rate fields.
  // (The old 8%/12%/16% <option> list no longer exists: rates are now
  // numeric inputs in this sheet, so there is no option assertion to map.)
  await planDialog.getByRole("button", { name: /Nâng cao cho mô phỏng/ }).click();
  const simulationDialog = page.getByRole("dialog", { name: "Giả định mô phỏng" });
  await expect(simulationDialog).toBeVisible();
  await expect(simulationDialog.getByText("Lợi suất VWCE")).toBeVisible();
  await expect(simulationDialog.getByText("Lạm phát")).toBeVisible();
  await expect(simulationDialog.getByText("Phần an toàn")).toBeVisible();
  await expect(simulationDialog.getByText("%/năm")).toHaveCount(3);
  await simulationDialog.getByRole("button", { name: "Xong" }).click();
  await expect(planDialog).toBeVisible();
  await planDialog.getByRole("button", { name: "Xong" }).click();
  await expect(planDialog).toHaveCount(0);

  // Former "Giá" tab: the "Giá VWCE" row opens the prices sheet. The refresh
  // action is now the published-feed sync ("Đồng bộ feed giá", QuoteFeedRefresh),
  // not the old direct "Cập nhật giá bây giờ" button.
  await page.getByRole("button", { name: "Giá VWCE", exact: true }).click();
  const pricesDialog = page.getByRole("dialog", { name: "Giá VWCE" });
  await expect(pricesDialog).toBeVisible();
  await expect(pricesDialog.getByRole("button", { name: "Đồng bộ feed giá" })).toBeVisible();
  await expect(pricesDialog.getByText("Thông tin nguồn giá")).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await pricesDialog.getByRole("button", { name: "Đóng" }).click();
  await expect(pricesDialog).toHaveCount(0);

  // Former "Dữ liệu" tab: backup/restore live in the "Sao lưu & khôi phục"
  // sheet and sync lives in the separate "Đồng bộ" sheet.
  await page.getByRole("button", { name: "Sao lưu & khôi phục", exact: true }).click();
  const transfersDialog = page.getByRole("dialog", { name: "Sao lưu & khôi phục" });
  await expect(transfersDialog).toBeVisible();
  await expect(transfersDialog.getByRole("button", { name: /Sao lưu JSON/ })).toBeVisible();
  await expect(transfersDialog.getByRole("button", { name: /Khôi phục dữ liệu/ })).toBeVisible();
  const transferActionHeights = await transfersDialog.locator(".set2-action").evaluateAll((buttons) => buttons.map((button) => Math.round(button.getBoundingClientRect().height)));
  expect(transferActionHeights.length).toBeGreaterThan(0);
  expect(transferActionHeights.every((height) => height >= 44)).toBe(true);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await transfersDialog.getByRole("button", { name: "Đóng" }).click();
  await expect(transfersDialog).toHaveCount(0);

  await page.getByRole("button", { name: "Đồng bộ", exact: true }).click();
  const syncDialog = page.getByRole("dialog", { name: "Đồng bộ" });
  await expect(syncDialog).toBeVisible();
  await expect(syncDialog.getByRole("button", { name: /Đồng bộ ngay/ })).toBeVisible();
  const syncButtonHeights = await syncDialog.locator(".set2-sync-btn").evaluateAll((buttons) => buttons.map((button) => Math.round(button.getBoundingClientRect().height)));
  expect(syncButtonHeights.length).toBe(1);
  expect(syncButtonHeights.every((height) => height >= 44)).toBe(true);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test.describe("retained visual evidence", () => {
  test("captures the desktop authentication entry", async ({ page }, testInfo) => {
    await captureVisualEvidence(page, testInfo, "visual-evidence-auth-desktop.png");
  });

  test("captures the iPhone 13 authentication entry", async ({ page }, testInfo) => {
    await page.setViewportSize(iphone13Viewport);
    await captureVisualEvidence(page, testInfo, "visual-evidence-auth-iphone-13.png");
  });
});

test("installed PWA keeps a cached app shell available while offline", async ({ page, browserName }) => {
  await openPrivateVaultEntry(page);

  await expect.poll(() => page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    const cacheNames = await caches.keys();
    return Boolean(navigator.serviceWorker.controller && registration.active && cacheNames.length > 0);
  })).toBe(true);

  // WebKit exposes the registration and Cache API, but its automation runtime
  // cannot route an offline page navigation/fetch through the service worker.
  // The production artifact's app-shell precache is verified in test:release.
  if (browserName === "webkit") return;

  await page.context().setOffline(true);
  try {
    const recoveredShell = await page.evaluate(async () => {
      const response = await fetch("./index.html", { cache: "no-store" });
      const html = await response.text();
      return response.ok && html.includes('<div id="root"></div>');
    });
    expect(recoveredShell).toBe(true);
  } finally {
    await page.context().setOffline(false);
  }
});

test("preview exposes an installable PWA and consistent quote feeds", async ({ request }) => {
  const manifestResponse = await request.get("./manifest.webmanifest");
  expect(manifestResponse.ok()).toBe(true);
  const manifest = (await manifestResponse.json()) as {
    start_url: string;
    display: string;
    icons: Array<{ src: string; type?: string; purpose?: string }>;
  };

  expect(manifest.start_url).toBe(appPath);
  expect(manifest.display).toBe("standalone");
  expect(
    manifest.icons.some(
      (icon) => icon.type === "image/png" && icon.purpose?.split(/\s+/).includes("maskable"),
    ),
  ).toBe(true);

  for (const icon of manifest.icons) {
    const iconResponse = await request.get(icon.src);
    expect(iconResponse.ok(), `${icon.src} should load`).toBe(true);
  }

  const serviceWorkerResponse = await request.get("./sw.js");
  expect(serviceWorkerResponse.ok()).toBe(true);
  // Live price feeds are network-only (never precached), so the worker must
  // not reference any /data/ file. The feed itself is fetched fresh below.
  const swText = await serviceWorkerResponse.text();
  expect(swText).not.toContain("data/");

  const quotesResponse = await request.get("./data/quotes.json");
  const legacyResponse = await request.get("./data/vwce-price.json");
  expect(quotesResponse.ok()).toBe(true);
  expect(legacyResponse.ok()).toBe(true);

  const quotes = (await quotesResponse.json()) as {
    schemaVersion: number;
    quotes: Array<{
      instrumentIsin: string;
      price: number;
      currency: string;
      venue: string;
      asOf: string;
    }>;
  };
  const legacy = (await legacyResponse.json()) as {
    schemaVersion: number;
    isin: string;
    price: number;
    currency: string;
    venue: string;
    asOf: string;
  };
  const current = quotes.quotes.find((quote) => quote.instrumentIsin === legacy.isin);

  expect(quotes.schemaVersion).toBe(2);
  expect(legacy.schemaVersion).toBe(1);
  expect(current).toBeDefined();
  expect(current?.price).toBe(legacy.price);
  expect(current?.currency).toBe(legacy.currency);
  expect(current?.venue).toBe(legacy.venue);
  expect(current?.asOf).toBe(legacy.asOf);
});


test("stable PWA update bridge registers without showing a notice when no worker is waiting", async ({ page, request }) => {
  const bridgeResponse = await request.get("./registerSW.js");
  expect(bridgeResponse.ok()).toBe(true);
  expect(await bridgeResponse.text()).toContain("SKIP_WAITING");

  await page.goto("./", { waitUntil: "domcontentloaded" });
  await expect.poll(() => page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    return Boolean(
      navigator.serviceWorker.controller
      && registration.active
      && !registration.waiting,
    );
  })).toBe(true);
  await expect(page.locator("[data-testid=pwa-update-notice]")).toHaveCount(0);
});
