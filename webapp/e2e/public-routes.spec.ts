import { expect, open, test } from "./fixtures";

/**
 * Every page a signed-out visitor can reach renders its own heading, stays on
 * its address and logs nothing wrong. The headings are the French copy on the
 * mock catalogue: a migration that changes a text or a route fails here.
 * Public pages live under `/fr` (and `/en`, see locale.spec.ts) since phase 3;
 * sign-in, recovery, the Studio share viewer and the system pages are not prefixed.
 */
const PUBLIC_ROUTES: { path: string; heading: RegExp }[] = [
  { path: "/fr", heading: /tooth gems, Academy et Studio 3D/ },
  { path: "/fr/boutique", heading: /Gems, outils et kits professionnels/ },
  { path: "/fr/boutique/aurora-heart", heading: /Aurora Heart/ },
  { path: "/fr/formes", heading: /Toutes les formes de gems/ },
  { path: "/fr/couleurs", heading: /Toutes les couleurs de gems/ },
  { path: "/connexion", heading: /Connexion/ },
  { path: "/inscription", heading: /Créez votre compte Global Toothgems/ },
  { path: "/mot-de-passe-oublie", heading: /Mot de passe oublié/ },
  { path: "/reinitialiser-mot-de-passe", heading: /Choisissez un nouveau mot de passe/ },
  { path: "/verifier-email", heading: /Vérification de votre e-mail/ },
  { path: "/confirmation-compte", heading: /Ce lien n’est plus valable/ },
  { path: "/fr/fidelite", heading: /Vos récompenses/ },
  { path: "/fr/carte-cadeau", heading: /Offrez l’éclat d’un sourire/ },
  { path: "/fr/studio-3d", heading: /Créez vos propres bijoux dentaires/ },
  { path: "/fr/studio-3d/abonnement", heading: /Débloquez le Studio 3D/ },
  { path: "/studio-3d/partage", heading: /Ce lien ne contient pas de création lisible/ },
  { path: "/fr/academy", heading: /Apprenez\. Créez\. Maîtrisez votre art\./ },
  { path: "/fr/academy/formation/fondation", heading: /Fondation Tooth Gem/ },
  { path: "/fr/aide", heading: /Centre d’aide/ },
  { path: "/fr/aide/faq", heading: /Questions fréquentes/ },
  { path: "/fr/livraison", heading: /Livraison/ },
  { path: "/fr/retours-remboursements", heading: /Retours et remboursements/ },
  { path: "/fr/contact", heading: /Nous contacter/ },
  { path: "/fr/mentions-legales", heading: /Mentions légales/ },
  { path: "/fr/conditions-generales", heading: /Conditions générales de vente/ },
  { path: "/fr/conditions-generales-utilisation", heading: /Conditions générales d’utilisation/ },
  { path: "/fr/confidentialite", heading: /Politique de confidentialité/ },
  { path: "/fr/cookies", heading: /Politique cookies/ },
  { path: "/fr/a-propos", heading: /À propos de Global Toothgems/ },
  { path: "/admin/connexion", heading: /Administration/ },
  { path: "/erreur", heading: /Quelque chose s’est un peu déréglé/ },
  { path: "/maintenance", heading: /Nous revenons très vite/ },
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
  await expect(page).toHaveURL((url) => url.pathname === "/fr");
  await expect(page).toHaveTitle("Global Toothgems — tooth gems, Academy et Studio 3D");
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  expect(problems).toEqual([]);
});

test("an unknown address answers 404 and shows the app's 404 page", async ({ page }) => {
  const response = await page.goto("/cette-page-n-existe-pas");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 }).first()).toHaveText(/Oups, cette page a fait un petit détour/);
});

/* Old addresses: moved permanently by the server (legacy French and English
   aliases), or redirected by the app (`/connexion-b`). */
const ALIASES: [from: string, to: string][] = [
  ["/accueil-b", "/fr"],
  ["/boutique", "/fr/boutique"],
  ["/boutique-b", "/fr/boutique"],
  ["/aide/faq", "/fr/aide/faq"],
  ["/connexion-b", "/connexion"],
  ["/terms-of-sale", "/en/terms-of-sale"],
  ["/terms-of-use", "/en/terms-of-use"],
  ["/help", "/en/help"],
  ["/privacy-policy", "/en/privacy-policy"],
  ["/studio-3d/subscribe", "/en/3d-studio/subscribe"],
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
  // The editor is a lazy chunk carrying three.js; a dev server compiles it on
  // first request, which can take longer than the default 5 s under load.
  await expect(page).toHaveTitle(/Studio 3D · Atelier/, { timeout: 30_000 });
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 30_000 });
  expect(problems).toEqual([]);
});

test("each product card shows its own photo", async ({ page, problems }) => {
  await open(page, "/fr/boutique");
  // `src`, the photo each card asks for: `currentSrc` stays empty until the
  // browser has picked the image, which the server-rendered page leaves to its own timing.
  const photos = await page.locator("main article img").evaluateAll((images) => images.map((img) => (img as HTMLImageElement).src));
  expect(photos.length).toBeGreaterThanOrEqual(8);
  // A bundler that resolves every fixture photo to the same file once showed
  // one image on every card; the mock catalogue uses many different photos.
  expect(new Set(photos).size).toBeGreaterThanOrEqual(8);
  expect(problems).toEqual([]);
});
