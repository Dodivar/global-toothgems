import { test as base, expect, type Page } from "@playwright/test";

/**
 * A page that records what a smoke test must never see: console errors,
 * uncaught exceptions and same-origin requests that fail (a missing asset or
 * chunk). Third-party hosts (Google Fonts) are answered locally with an empty
 * body so the tests neither depend on the network nor report its failures.
 */
export const test = base.extend<{ problems: string[] }>({
  // The second argument is Playwright's `use`, renamed so lint does not take it for a React hook.
  problems: async ({ page, baseURL }, provide) => {
    const origin = new URL(baseURL!).origin;
    const problems: string[] = [];

    await page.route(
      (url) => url.origin !== origin,
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

/** Opens a path and waits until the app has rendered its main landmark. */
export async function open(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator("main#main")).toBeVisible();
  await page.waitForLoadState("networkidle");
}

/** The cookie banner covers the bottom of the screen on every first visit. */
export async function dismissCookieBanner(page: Page) {
  const refuse = page.getByRole("button", { name: /refuser les non essentiels/i });
  if (await refuse.isVisible()) await refuse.click();
}
