import { expect, test } from "@playwright/test";

const localOrigin = "http://127.0.0.1:4173";
const appPath = "/quy-vwce-cho-be/";

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

test("private-vault authentication entry point remains usable", async ({ page }) => {
  await page.goto("./", { waitUntil: "domcontentloaded" });

  const loginHeading = page.getByRole("heading", { name: "Đăng nhập", exact: true });
  const missingConfigHeading = page.getByRole("heading", {
    name: "Chưa cấu hình đăng nhập",
    exact: true,
  });

  if (await loginHeading.isVisible()) {
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Mật khẩu")).toBeVisible();
    await expect(page.getByText("Tối thiểu 14 ký tự")).toBeVisible();
    await expect(page.getByText(/Kho gia đình riêng tư/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Đăng nhập", exact: true })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Tạo tài khoản mới" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Quên mật khẩu?" })).toBeVisible();
  } else {
    await expect(missingConfigHeading).toBeVisible();
    await expect(page.getByText("VITE_SUPABASE_URL")).toBeVisible();
    await expect(page.getByText("VITE_SUPABASE_ANON_KEY")).toBeVisible();
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
