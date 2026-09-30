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
