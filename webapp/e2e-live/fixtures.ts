import { test as base, expect, type Page } from "@playwright/test";
import { installReactCommitCounter, waitForReactSettled } from "../e2e/support/react-settled";
import { liveEnv, testPassword } from "./env";

/**
 * Same discipline as the smoke tests' fixture (e2e/fixtures.ts): console
 * errors, uncaught exceptions and failed same-origin requests are recorded
 * and every test asserts there were none. Other hosts are answered locally,
 * except the local Supabase stack, which is the point of this suite.
 */
export const test = base.extend<{ problems: string[] }>({
  page: async ({ page }, provide) => {
    await installReactCommitCounter(page);
    await provide(page);
  },
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
    // Vercel serves /_vercel/* (Speed Insights, app/layout.tsx) on its own platform; `next start` cannot.
    await page.route(
      (url) => url.origin === origin && url.pathname.startsWith("/_vercel/"),
      (route) => route.fulfill({ status: 200, body: "", contentType: "text/javascript" }),
    );
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      // A refused Supabase call is reported below with its status and path; the browser's own
      // "Failed to load resource" line for it would only repeat it.
      if (message.text().startsWith("Failed to load resource") && message.location().url.startsWith(supabase)) return;
      problems.push(`console: ${message.text()}`);
    });
    page.on("pageerror", (error) => problems.push(`exception: ${error.message}`));
    page.on("response", (response) => {
      if (response.url().startsWith(origin) && response.status() >= 400) {
        problems.push(`HTTP ${response.status()}: ${response.url()}`);
      }
      if (response.url().startsWith(supabase) && response.status() >= 400) {
        problems.push(`Supabase HTTP ${response.status()}: ${new URL(response.url()).pathname}`);
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
  await waitForReactSettled(page);
}

export async function dismissCookieBanner(page: Page) {
  const refuse = page.getByRole("button", { name: /refuser les non essentiels/i });
  if (await refuse.isVisible()) await refuse.click();
}

/** Signs in through the real form of `/connexion` (or `/admin/connexion`). */
export async function signIn(page: Page, email: string, path = "/connexion", password = testPassword()) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  await waitForReactSettled(page);
  await dismissCookieBanner(page);
  // The header has its own "Se connecter" button (type=button): the form's is the submit one.
  const submit = page.getByRole("button", { name: /^se connecter$/i }).and(page.locator('[type="submit"]'));
  const form = page.locator("form").filter({ has: submit });
  await form.getByLabel(/e-mail/i).fill(email);
  await form.getByLabel(/^mot de passe/i).fill(password);
  await submit.click();
}
