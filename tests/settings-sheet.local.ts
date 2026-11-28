import { expect, test, type Locator, type Page } from "@playwright/test";

const cases = [
  { locale: "vi", theme: "light", width: 390, height: 844 },
  { locale: "de", theme: "dark", width: 320, height: 568 },
  { locale: "vi", theme: "premium", width: 390, height: 667 },
] as const;
test.use({ serviceWorkers: "block", isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

async function verifySheet(page: Page, dialog: Locator, action: Locator) {
  await expect(dialog).toBeVisible();
  await expect(dialog).toBeInViewport({ ratio: 1 });
  await expect(action).toBeInViewport({ ratio: 1 });
  await action.click({ trial: true });
  const surface = await dialog.evaluate(el => {
    const style = getComputedStyle(el);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = style.backgroundColor;
    ctx.fillRect(0, 0, 1, 1);
    return { portal: el.parentElement?.parentElement === document.body, alpha: ctx.getImageData(0,0,1,1).data[3] };
  });
  expect(surface).toEqual({ portal: true, alpha: 255 });
  await expect(page.locator(".bottom-dock")).not.toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
}

for (const variant of cases) {
  test(`Settings child sheets · ${variant.locale} ${variant.theme} ${variant.width}x${variant.height}`, async ({ page }, info) => {
    const de = variant.locale === "de";
    await page.setViewportSize({ width: variant.width, height: variant.height });
    await page.addInitScript(({ locale, theme }) => {
      localStorage.setItem("vwce-locale", locale);
      localStorage.setItem("vwce-theme", theme);
    }, variant);
    await page.goto("./");
    const start = page.getByRole("button", { name: de ? "Starten" : "Bắt đầu", exact: true });
    // This suite intentionally fails if CI does not build the isolated local app.
    await expect(start).toBeVisible();
    await start.click();
    await expect(page.locator(".ovb2")).toBeVisible();
    await page.goto("./#/settings");
    await expect(page.locator(".set2")).toBeVisible();
    await expect(page.getByTestId("settings-status-center")).toBeVisible();
    await page.screenshot({ path: info.outputPath("settings-overview-after.png"), animations: "disabled", fullPage: true });
    const close = de ? "Schließen" : "Đóng";
    for (const [row, title, id] of [
      [de ? "Passwort" : "Mật khẩu", de ? "Passwort ändern" : "Đổi mật khẩu", "change"],
      [de ? "Wiederherstellungslink" : "Link khôi phục", de ? "Passwort vergessen" : "Quên mật khẩu", "reset"],
      [de ? "Zwei-Faktor-Auth" : "Xác thực 2 lớp", "", "mfa"],
    ]) {
      await page.locator(".set2-row").filter({ hasText: row }).click();
      const dialog = page.locator(".settings-child-sheet");
      if (title) await expect(dialog).toHaveAccessibleName(title);
      await verifySheet(page, dialog, dialog.locator(".settings-child-primary"));
      await page.screenshot({ path: info.outputPath(`settings-sheet-${id}.png`), animations: "disabled" });
      await dialog.getByRole("button", { name: close, exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect(page.locator(".bottom-dock")).toBeVisible();
    }
    const transfers = de ? "Sichern & wiederherstellen" : "Sao lưu & khôi phục";
    for (const [label, id] of [[de ? "JSON sichern" : "Sao lưu JSON", "backup"], [de ? "Daten wiederherstellen" : "Khôi phục dữ liệu", "restore"]]) {
      await page.getByRole("button", { name: transfers, exact: true }).click();
      const parent = page.getByRole("dialog", { name: transfers });
      await verifySheet(page, parent, parent.getByRole("button", { name: label }));
      await parent.getByRole("button", { name: label }).click();
      const child = page.locator(".settings-child-sheet");
      await expect(parent).toHaveCount(0);
      await verifySheet(page, child, child.locator(".settings-child-primary"));
      await page.screenshot({ path: info.outputPath(`settings-sheet-${id}.png`), animations: "disabled" });
      await child.getByRole("button", { name: close, exact: true }).click();
      await expect(child).toHaveCount(0);
      await expect(page.locator(".bottom-dock")).toBeVisible();
    }
    // No password email, TOTP enrollment, export or restore action is submitted.
  });
}


test.describe("desktop Settings overview", () => {
  test.use({ isMobile: false, hasTouch: false, viewport: { width: 1440, height: 900 } });
  test("local status, groups and no horizontal overflow", async ({ page }, info) => {
    await page.addInitScript(() => { localStorage.setItem("vwce-locale", "de"); localStorage.setItem("vwce-theme", "light"); });
    await page.goto("./");
    await page.getByRole("button", { name: "Starten", exact: true }).click();
    await expect(page.locator(".ovb2")).toBeVisible();
    await page.goto("./#/settings");
    const center = page.getByTestId("settings-status-center");
    await expect(center).toBeVisible();
    await expect(page.getByRole("heading", { name: "ERWEITERT", exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath("settings-desktop-after.png"), animations: "disabled", fullPage: true });
  });
});
