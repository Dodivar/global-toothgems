import { test as base, expect, type Page } from "@playwright/test";
import { liveEnv, testPassword } from "./env";

/**
 * Same discipline as the smoke tests' fixture (e2e/fixtures.ts): console
 * errors, uncaught exceptions and failed same-origin requests are recorded
 * and every test asserts there were none. Other hosts are answered locally,
 * except the local Supabase stack, which is the point of this suite.
 */
export const test = base.extend<{ problems: string[] }>({
  problems: async ({ page, baseURL }, provide) => {
    const origin = new URL(baseURL!).origin;
    const supabase = new URL(liveEnv().url).origin;
    const problems: string[] = [];

    await page.route(
      (url) => url.origin !== origin && url.origin !== supabase,
      (route) =>
        route.fulfill({
          status: 200,
          body: "",
          contentType: route.request().resourceType() === "stylesheet" ? "text/css" : "text/plain",
        }),
    );
    page.on("console", (message) => {
      if (message.type() === "error") problems.push(`console: ${message.text()}`);
    });
    page.on("pageerror", (error) => problems.push(`exception: ${error.message}`));
    page.on("response", (response) => {
      if (response.url().startsWith(origin) && response.status() >= 400) {
        problems.push(`HTTP ${response.status()}: ${response.url()}`);
      }
    });

    await provide(problems);
  },
});

export { expect };

export async function open(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator("main#main")).toBeVisible();
  await page.waitForLoadState("networkidle");
}

export async function dismissCookieBanner(page: Page) {
  const refuse = page.getByRole("button", { name: /refuser les non essentiels/i });
  if (await refuse.isVisible()) await refuse.click();
}

/** Signs in through the real form of `/connexion` (or `/admin/connexion`). */
export async function signIn(page: Page, email: string, path = "/connexion", password = testPassword()) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  await dismissCookieBanner(page);
  const submit = page.getByRole("button", { name: /^se connecter$/i });
  const form = page.locator("form").filter({ has: submit });
  await form.getByLabel(/e-mail/i).fill(email);
  await form.getByLabel(/^mot de passe/i).fill(password);
  await submit.click();
}
