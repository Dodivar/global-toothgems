import { dismissCookieBanner, expect, open, test } from "./fixtures";

test("a product added from its page shows in the cart", async ({ page, problems }) => {
  await open(page, "/fr/boutique/opale");
  await dismissCookieBanner(page);
  const product = await page.getByRole("heading", { level: 1 }).first().innerText();

  const cartButton = page.getByRole("button", { name: /^Panier, \d+ articles?$/ });
  const before = await cartButton.getAttribute("aria-label");
  await page.getByRole("button", { name: /ajouter au panier/i }).click();
  await expect(cartButton).not.toHaveAttribute("aria-label", before!);

  // The mock cart lives in memory: reach it without reloading the page.
  await page.getByRole("button", { name: /voir le panier/i }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/fr/panier");
  await expect(page.getByRole("heading", { name: "Votre panier" })).toBeVisible();
  const line = page.getByRole("listitem").filter({ hasText: product });
  await expect(line).toBeVisible();

  await line.getByRole("button", { name: /augmenter/i }).click();
  await expect(line.getByText("2", { exact: true })).toBeVisible();
  expect(problems).toEqual([]);
});

test("the demo payment ends on the confirmation, with a delivery option picked", async ({ page, problems }) => {
  await open(page, "/fr/panier");
  await dismissCookieBanner(page);
  await expect(page.getByRole("radio", { name: /livraison standard/i })).toBeChecked();
  await page.getByRole("button", { name: /^payer/i }).last().click();
  await expect(page.getByRole("heading", { name: /merci, votre commande est enregistrée/i })).toBeVisible();
  expect(problems).toEqual([]);
});

test("Stripe's return address renders, grants nothing, and is not indexed", async ({ page, problems }) => {
  await open(page, "/fr/panier/confirmation?session_id=cs_test_a1B2c3D4e5F6g7H8");
  // Mock mode has no database to ask: the link cannot be confirmed.
  await expect(page.getByRole("heading", { name: "Lien de confirmation invalide" })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await open(page, "/en/cart/confirmation");
  await expect(page.getByRole("heading", { name: "Invalid confirmation link" })).toBeVisible();
  expect(problems).toEqual([]);
});
