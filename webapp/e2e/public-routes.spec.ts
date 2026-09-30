import { expect, open, test } from "./fixtures";

/**
 * Every page a signed-out visitor can reach renders its own heading, stays on
 * its address and logs nothing wrong. The headings are the French copy on the
 * mock catalogue: a migration that changes a text or a route fails here.
 */
const PUBLIC_ROUTES: { path: string; heading: RegExp }[] = [
  { path: "/", heading: /tooth gems, Academy et Studio 3D/ },
  { path: "/boutique", heading: /Gems, outils et kits professionnels/ },
  { path: "/boutique/aurora-heart", heading: /Aurora Heart/ },
  { path: "/formes", heading: /Toutes les formes de gems/ },
  { path: "/couleurs", heading: /Toutes les couleurs de gems/ },
  { path: "/connexion", heading: /Connexion/ },
  { path: "/inscription", heading: /Créez votre compte Global Toothgems/ },
  { path: "/mot-de-passe-oublie", heading: /Mot de passe oublié/ },
  { path: "/reinitialiser-mot-de-passe", heading: /Choisissez un nouveau mot de passe/ },
  { path: "/verifier-email", heading: /Vérification de votre e-mail/ },
  { path: "/confirmation-compte", heading: /Ce lien n’est plus valable/ },
  { path: "/fidelite", heading: /Vos récompenses/ },
  { path: "/carte-cadeau", heading: /Offrez l’éclat d’un sourire/ },
  { path: "/studio-3d", heading: /Créez vos propres bijoux dentaires/ },
  { path: "/studio-3d/abonnement", heading: /Débloquez le Studio 3D/ },
  { path: "/studio-3d/partage", heading: /Ce lien ne contient pas de création lisible/ },
  { path: "/academy", heading: /Une formation\s*qui tient en cabine/ },
  { path: "/academy/formation/fondation", heading: /Fondation Tooth Gem/ },
  { path: "/aide", heading: /Centre d’aide/ },
  { path: "/aide/faq", heading: /Questions fréquentes/ },
  { path: "/livraison", heading: /Livraison/ },
  { path: "/retours-remboursements", heading: /Retours et remboursements/ },
  { path: "/contact", heading: /Nous contacter/ },
  { path: "/mentions-legales", heading: /Mentions légales/ },
  { path: "/conditions-generales", heading: /Conditions générales de vente/ },
  { path: "/confidentialite", heading: /Politique de confidentialité/ },
  { path: "/cookies", heading: /Politique cookies/ },
  { path: "/a-propos", heading: /À propos de Global Toothgems/ },
  { path: "/admin/connexion", heading: /Administration/ },
  { path: "/erreur", heading: /Quelque chose s’est un peu déréglé/ },
  { path: "/maintenance", heading: /Nous revenons très vite/ },
  { path: "/cette-page-n-existe-pas", heading: /Oups, cette page a fait un petit détour/ },
];

for (const { path, heading } of PUBLIC_ROUTES) {
  test(`${path} renders without errors`, async ({ page, problems }) => {
    await open(page, path);
    await expect(page.getByRole("heading", { level: 1 }).first()).toHaveText(heading);
    expect(new URL(page.url()).pathname).toBe(path);
    expect(problems).toEqual([]);
  });
}

test("the page title and document language are set", async ({ page, problems }) => {
  await open(page, "/");
  await expect(page).toHaveTitle("Global Toothgems");
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  expect(problems).toEqual([]);
});

/* English and legacy addresses are client-side redirects to the French routes. */
const ALIASES: [from: string, to: string][] = [
  ["/accueil-b", "/"],
  ["/boutique-b", "/boutique"],
  ["/connexion-b", "/connexion"],
  ["/terms-of-sale", "/conditions-generales"],
  ["/help", "/aide"],
  ["/privacy-policy", "/confidentialite"],
  ["/studio-3d/subscribe", "/studio-3d/abonnement"],
];

for (const [from, to] of ALIASES) {
  test(`${from} redirects to ${to}`, async ({ page, problems }) => {
    await open(page, from);
    await expect(page).toHaveURL((url) => url.pathname === to);
    expect(problems).toEqual([]);
  });
}

test("the Studio 3D editor loads its 3D engine", async ({ page, problems }) => {
  await open(page, "/studio-3d/atelier");
  await expect(page).toHaveTitle(/Studio 3D · Atelier/);
  await expect(page.locator("canvas").first()).toBeVisible();
  expect(problems).toEqual([]);
});

test("each product card shows its own photo", async ({ page, problems }) => {
  await open(page, "/boutique");
  const photos = await page.locator("main article img").evaluateAll((images) => images.map((img) => (img as HTMLImageElement).currentSrc));
  expect(photos.length).toBeGreaterThanOrEqual(8);
  // A bundler that resolves every fixture photo to the same file once showed
  // one image on every card; the mock catalogue uses many different photos.
  expect(new Set(photos).size).toBeGreaterThanOrEqual(8);
  expect(problems).toEqual([]);
});
