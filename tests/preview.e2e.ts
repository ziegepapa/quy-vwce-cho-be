import { expect, test, type Page, type TestInfo } from "@playwright/test";

const localOrigin = "http://127.0.0.1:4173";
const appPath = "/quy-vwce-cho-be/";
const iphone13Viewport = { width: 390, height: 844 };

type PreviewLocale = "vi" | "de";

function entryCopy(locale: PreviewLocale) {
  return locale === "de" ? {
    start: "Starten",
    login: "Anmelden",
    missingConfig: "Anmeldung nicht konfiguriert",
    overview: "Übersicht",
  } : {
    start: "Bắt đầu",
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
  if (await startButton.isVisible()) await startButton.click();
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
    await expect(page.getByText(/Kho gia đình riêng tư/)).toBeVisible();
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
    await expect(page.getByText("Privater Familien-Vault. Neue Konten werden ausschließlich vom Owner angelegt und bestätigt.")).toBeVisible();
    await expect(page.locator("#email")).toBeVisible();
    await page.locator("#email").focus();
    await page.keyboard.press("Tab");
    await expect(page.locator("#password")).toBeFocused();
    await expect(page.getByRole("button", { name: "Passwort vergessen?", exact: true })).toBeVisible();
    await expect(page.getByText("Kho gia đình riêng tư")).toHaveCount(0);
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

  for (const route of ["./", "./#/transactions", "./#/settings?view=clarity", "./#/settings?view=horizon"]) {
    await page.goto(route, { waitUntil: "networkidle" });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const dockHeights = await page.locator(".bottom-dock a").evaluateAll((links) => links.map((link) => Math.round(link.getBoundingClientRect().height)));
    expect(dockHeights).toHaveLength(4);
    expect(dockHeights.every((height) => height >= 44)).toBe(true);
  }

  await expect(page.locator(".settings-horizon")).toHaveCount(1);
  await expect(page.locator(".settings-horizon .annual-plan-studio")).toHaveCount(1);
  await expect.poll(() => page.locator(".settings-horizon").evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
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
  expect(await serviceWorkerResponse.text()).toContain("data/quotes.json");

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
