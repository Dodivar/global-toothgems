import { dismissCookieBanner, expect, open, test } from "./fixtures";

/* Mock mode: any address and password sign in; the registration journey
   simulates its own service. */

test("/compte redirects a signed-out visitor to the sign-in page", async ({ page, problems }) => {
  await open(page, "/compte");
  await expect(page).toHaveURL((url) => url.pathname === "/connexion");
  await expect(page.getByRole("heading", { level: 1 }).first()).toHaveText(/Connexion/);
  expect(problems).toEqual([]);
});

test("/compte/commandes redirects a signed-out visitor to the sign-in page", async ({ page, problems }) => {
  await open(page, "/compte/commandes");
  await expect(page).toHaveURL((url) => url.pathname === "/connexion");
  expect(problems).toEqual([]);
});

/* The back office has no sign-in page (decided 2026-11-11): a visitor who is
   not staff sees the site's ordinary 404, with the address asked for. */
for (const path of ["/admin", "/admin/produits", "/admin/connexion"]) {
  test(`${path} shows a signed-out visitor the 404`, async ({ page, problems }) => {
    await open(page, path);
    await expect(page.getByRole("heading", { level: 1 }).first()).toHaveText("Oups, cette page a fait un petit détour.", { timeout: 30_000 });
    expect(new URL(page.url()).pathname).toBe(path);
    expect(problems).toEqual([]);
  });
}

test("signing in lands on the member area", async ({ page, problems }) => {
  await open(page, "/compte");
  await expect(page).toHaveURL((url) => url.pathname === "/connexion");
  await dismissCookieBanner(page);

  const main = page.locator("main#main");
  await main.getByLabel(/e-mail/i).fill("smoke.test@example.com");
  await main.getByLabel(/^mot de passe$/i).fill("Smoke-Test-2026!");
  await main.getByRole("button", { name: /^se connecter$/i }).click();

  await expect(page).toHaveURL((url) => url.pathname === "/compte");
  expect(problems).toEqual([]);
});

test("the registration journey reaches its confirmation screen", async ({ page, problems }) => {
  await open(page, "/inscription");
  await dismissCookieBanner(page);

  await page.getByLabel(/adresse e-mail/i).fill("nouvelle.cliente@example.com");
  await page.getByLabel(/^mot de passe$/i).fill("Gemmes-Brillantes-2026!");
  await page.getByLabel(/confirmez le mot de passe/i).fill("Gemmes-Brillantes-2026!");
  await page.getByRole("button", { name: /^continuer$/i }).click();

  await page.getByLabel(/prénom/i).fill("Camille");
  await page.getByLabel(/^nom/i).fill("Roussel");
  await page.getByLabel(/pays/i).selectOption("FR");
  await page.getByRole("button", { name: /^continuer$/i }).click();

  // The checkbox is visually hidden behind a styled box and its label holds
  // links, so the input is clicked directly (React listens to that click).
  const terms = page.locator("#reg-terms");
  await terms.dispatchEvent("click");
  await expect(terms).toBeChecked();
  await page.getByRole("button", { name: /créer mon compte/i }).click();

  await expect(page.getByRole("heading", { name: "Consultez votre boîte mail" })).toBeVisible();
  await expect(page.getByText("n••••••••e@example.com")).toBeVisible();
  expect(problems).toEqual([]);
});
