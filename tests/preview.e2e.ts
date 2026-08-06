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
