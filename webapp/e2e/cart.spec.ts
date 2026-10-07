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

test("adding a product opens the notice under the cart icon: undo, outside click, countdown", async ({ page, problems }) => {
  await open(page, "/fr/boutique/opale");
  await dismissCookieBanner(page);
  const product = await page.getByRole("heading", { level: 1 }).first().innerText();
  const cartButton = page.getByRole("button", { name: /^Panier, \d+ articles?$/ });
  const add = page.getByRole("button", { name: /ajouter au panier/i }).first();
  const notice = page.locator(".gt-cart-notice");
  const undo = page.getByRole("button", { name: /annuler l.ajout/i });

  // Undo takes the addition back.
  const before = await cartButton.getAttribute("aria-label");
  await add.click();
  await expect(notice).toBeVisible();
  await expect(notice).toContainText(product);
  await expect(notice.getByRole("link", { name: /voir le panier/i })).toBeVisible();
  await expect(cartButton).not.toHaveAttribute("aria-label", before!);
  await undo.click();
  await expect(cartButton).toHaveAttribute("aria-label", before!);
  await expect(notice).toHaveCount(0);

  // A click anywhere else closes it, and keeps the product in the cart.
  await add.click();
  await expect(notice).toBeVisible();
  await page.getByRole("heading", { level: 1 }).first().click();
  await expect(notice).toHaveCount(0);
  await expect(cartButton).not.toHaveAttribute("aria-label", before!);

  // Left alone, it closes after its four seconds.
  await add.click();
  await expect(notice).toBeVisible();
  await page.waitForTimeout(2500);
  await expect(notice).toBeVisible();
  await expect(notice).toHaveCount(0, { timeout: 4000 });
  expect(problems).toEqual([]);
});

test("on a phone, the cart notice fits the screen under the cart icon", async ({ page, problems }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page, "/fr/boutique/opale");
  await dismissCookieBanner(page);
  await page.getByRole("button", { name: /ajouter au panier/i }).first().click();
  const box = await page.locator(".gt-cart-notice").boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(375);
  await page.getByRole("button", { name: /annuler l.ajout/i }).click();
  await expect(page.locator(".gt-cart-notice")).toHaveCount(0);
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
