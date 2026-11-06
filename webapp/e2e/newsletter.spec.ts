import { dismissCookieBanner, expect, open, test } from "./fixtures";

/**
 * The newsletter sign-up (home band) and its double opt-in page, in mock mode:
 * without a Supabase project nothing can be recorded, so the form says so instead
 * of pretending, and the confirmation page never confirms on its own.
 */

test("the home band refuses to pretend without the backend", async ({ page, problems }) => {
  await open(page, "/fr");
  await dismissCookieBanner(page);
  const band = page.locator("section[aria-labelledby='gt-alt-newsletter-title']");
  await band.scrollIntoViewIfNeeded();

  await band.getByRole("button", { name: "S’abonner" }).click();
  await expect(band.getByRole("alert")).toHaveText(/adresse e-mail valide/);

  await band.getByLabel("Adresse e-mail").fill("ana@example.com");
  await band.getByRole("button", { name: "S’abonner" }).click();
  await expect(band.getByRole("alert")).toHaveText(/Cochez la case/);

  await band.getByText("Oui, envoyez-moi la newsletter Global Toothgems").click();
  await band.getByRole("button", { name: "S’abonner" }).click();
  await expect(band.getByRole("alert")).toHaveText("L’inscription à la newsletter n’est pas disponible pour le moment.");
  expect(problems).toEqual([]);
});

test("the confirmation page asks for a click and reads a broken link as such", async ({ page, problems }) => {
  await open(page, "/newsletter/confirmer?token=nope");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Ce lien ne fonctionne plus");

  await open(page, `/newsletter/confirmer?token=${"ab".repeat(24)}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Confirmez votre inscription");
  await page.getByRole("button", { name: "Confirmer mon inscription" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Confirmation indisponible");
  expect(problems).toEqual([]);
});
