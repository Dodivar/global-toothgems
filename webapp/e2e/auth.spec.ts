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

test("/admin redirects a signed-out visitor to the back-office sign-in", async ({ page, problems }) => {
  await open(page, "/admin");
  await expect(page).toHaveURL((url) => url.pathname === "/admin/connexion");
  expect(problems).toEqual([]);
});

test("/admin/produits redirects a signed-out visitor to the back-office sign-in", async ({ page, problems }) => {
  await open(page, "/admin/produits");
  await expect(page).toHaveURL((url) => url.pathname === "/admin/connexion");
  expect(problems).toEqual([]);
});

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

  // The checkbox is visually replaced by a styled box; it is still the input that is checked.
  await page.locator("#reg-terms").check({ force: true });
  await page.getByRole("button", { name: /créer mon compte/i }).click();

  await expect(page.getByRole("heading", { name: "Consultez votre boîte mail" })).toBeVisible();
  await expect(page.getByText("n••••••••e@example.com")).toBeVisible();
  expect(problems).toEqual([]);
});
