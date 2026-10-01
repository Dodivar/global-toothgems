import type { Page } from "@playwright/test";
import { expect, open, test } from "./fixtures";

/**
 * "My orders" in mock mode: the history, an order's detail page and an
 * unknown reference. The real reads (RLS: own orders only, no staff notes)
 * are covered by `supabase/tests/iteration18_validation.sql`.
 */

const MEMBER = {
  firstName: "Camille",
  lastName: "Roussel",
  email: "smoke.test@example.com",
  phone: "",
  addressLine: "",
  postalCode: "",
  city: "",
  country: "fr",
  newsletter: false,
};

async function signInMember(page: Page) {
  await page.addInitScript((member) => window.sessionStorage.setItem("gt-demo-session", JSON.stringify(member)), MEMBER);
}

test("an order of the history opens its detail page", async ({ page, problems }) => {
  await signInMember(page);
  await open(page, "/compte/commandes");
  await page.getByRole("link", { name: "Voir le détail de la commande GT-2026-0129" }).click();

  await expect(page).toHaveURL((url) => url.pathname === "/compte/commandes/GT-2026-0129");
  const main = page.locator("main#main");
  await expect(main.getByRole("heading", { level: 1 })).toHaveText("Commande GT-2026-0129");
  await expect(main.getByText("Livrée", { exact: true }).first()).toBeVisible();
  await expect(main.getByRole("heading", { level: 2, name: "Articles" })).toBeVisible();
  await expect(main.getByRole("heading", { level: 2, name: "Montants" })).toBeVisible();
  await expect(main.getByRole("heading", { level: 2, name: "Adresses" })).toBeVisible();
  await expect(main.getByText("Ce récapitulatif de commande n’est pas une facture.")).toBeVisible();
  await expect(main.getByRole("button", { name: "Imprimer le récapitulatif" })).toBeVisible();

  await main.getByRole("link", { name: "Toutes mes commandes" }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/compte/commandes");
  expect(problems).toEqual([]);
});

test("an order detail page opened directly renders inside the member space", async ({ page, problems }) => {
  await signInMember(page);
  await open(page, "/compte/commandes/GT-2026-0151");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Commande GT-2026-0151");
  await expect(page.getByText("Colissimo").first()).toBeVisible();
  expect(problems).toEqual([]);
});

test("an unknown order reference says the order is not found", async ({ page, problems }) => {
  await signInMember(page);
  await open(page, "/compte/commandes/GT-000000");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Commande introuvable");
  expect(problems).toEqual([]);
});
