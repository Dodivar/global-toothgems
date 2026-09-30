import type { Page } from "@playwright/test";
import { dismissCookieBanner, expect, open, test } from "./fixtures";

/**
 * Phase 4 of docs/migration-nextjs.md: the member space, the learner pages,
 * the back office and the Studio workspace are zones of their own, each
 * loading only its code; moving between zones is a full page load. Mock mode:
 * the demo sessions are kept for the tab (sessionStorage), so a test opens a
 * session by writing it before the page loads.
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
const STAFF = { name: "Camille Dubois", email: "camille@globaltoothgems.com", role: "owner", initials: "CD" };

async function signInMember(page: Page) {
  await page.addInitScript((member) => window.sessionStorage.setItem("gt-demo-session", JSON.stringify(member)), MEMBER);
}

async function signInStaff(page: Page) {
  await page.addInitScript((staff) => window.sessionStorage.setItem("gt-demo-admin-session", JSON.stringify(staff)), STAFF);
}

async function expectScreen(page: Page, path: string, heading: RegExp) {
  await open(page, path);
  await expect(page.getByRole("heading", { level: 1 }).first()).toHaveText(heading);
  expect(new URL(page.url()).pathname).toBe(path);
}

const MEMBER_SCREENS: { path: string; heading: RegExp }[] = [
  { path: "/compte", heading: /^Bonjour Camille Roussel$/ },
  { path: "/compte/attestations", heading: /^Mes attestations$/ },
  { path: "/compte/commandes", heading: /^Mes commandes$/ },
  { path: "/compte/profil", heading: /^Mon profil$/ },
  { path: "/compte/securite", heading: /^Sécurité et confidentialité$/ },
  { path: "/compte/fidelite", heading: /^Ma carte de fidélité$/ },
  { path: "/compte/avis", heading: /^Mes avis$/ },
  { path: "/compte/communaute", heading: /^Bienvenue dans la communauté des artistes$/ },
  { path: "/compte/communaute/membres", heading: /^Les artistes de la communauté$/ },
  { path: "/compte/communaute/charte", heading: /^Notre façon de faire$/ },
];

for (const { path, heading } of MEMBER_SCREENS) {
  test(`member space: ${path} renders for a signed-in member`, async ({ page, problems }) => {
    await signInMember(page);
    await expectScreen(page, path, heading);
    expect(problems).toEqual([]);
  });
}

test("member space: the sidebar and the community's links are client-side navigations", async ({ page, problems }) => {
  await signInMember(page);
  await open(page, "/compte");
  await dismissCookieBanner(page);
  await page.evaluate(() => ((window as unknown as { gtMarker: number }).gtMarker = 1));
  const marker = () => page.evaluate(() => (window as unknown as { gtMarker?: number }).gtMarker);
  const follow = async (selector: string) => {
    const link = page.locator(selector).first();
    await expect(link).toBeVisible({ timeout: 30_000 });
    const href = await link.getAttribute("href");
    await link.click();
    // A client-side navigation asks the server for the page's segment: compiled on first request by a dev server.
    await expect(page).toHaveURL((url) => url.pathname === href, { timeout: 30_000 });
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    expect(await marker()).toBe(1);
  };
  await follow('aside a[href="/compte/commandes"]');
  await follow('aside a[href="/compte/communaute"]');
  // The community's pages without a smoke test of their own until phase 5.
  await follow('main a[href^="/compte/communaute/canal/"]');
  await follow('main a[href^="/compte/communaute/discussion/"]');
  await follow('main a[href^="/compte/communaute/activite/"]');
  await page.waitForLoadState("networkidle");
  expect(problems).toEqual([]);
});

test("member space: an unknown address is the 404 screen inside the shell", async ({ page, problems }) => {
  await signInMember(page);
  await expectScreen(page, "/compte/nimporte-quoi", /Oups, cette page a fait un petit détour/);
  expect(problems).toEqual([]);
});

const LEARNER_SCREENS: { path: string; heading: RegExp }[] = [
  { path: "/academy/mes-formations/fondation", heading: /^Pose professionnelle de tooth gems$/ },
  { path: "/academy/mes-formations/business/terminee", heading: /^Formation terminée$/ },
];

for (const { path, heading } of LEARNER_SCREENS) {
  test(`learner pages: ${path} renders for a signed-in member`, async ({ page, problems }) => {
    await signInMember(page);
    await expectScreen(page, path, heading);
    expect(problems).toEqual([]);
  });
}

test("learner pages: /academy/lecon forwards to the course that was opened", async ({ page, problems }) => {
  await signInMember(page);
  await open(page, "/academy/lecon");
  await expect(page).toHaveURL((url) => url.pathname.startsWith("/academy/mes-formations/"));
  expect(problems).toEqual([]);
});

const STAFF_SCREENS: { path: string; heading: RegExp }[] = [
  { path: "/admin", heading: /^Bonjour Camille$/ },
  { path: "/admin/commandes", heading: /^Commandes$/ },
  { path: "/admin/clients", heading: /^Clients$/ },
  { path: "/admin/utilisateurs", heading: /^Utilisateurs$/ },
  { path: "/admin/statistiques", heading: /^Statistiques$/ },
  { path: "/admin/produits", heading: /^Produits$/ },
  { path: "/admin/categories", heading: /^Catégories$/ },
  { path: "/admin/promotions", heading: /^Promotions$/ },
  { path: "/admin/avis", heading: /^Avis$/ },
  { path: "/admin/parametres", heading: /^Paramètres$/ },
  { path: "/admin/formations", heading: /^Formations$/ },
];

for (const { path, heading } of STAFF_SCREENS) {
  test(`back office: ${path} renders for signed-in staff`, async ({ page, problems }) => {
    await signInStaff(page);
    await expectScreen(page, path, heading);
    expect(problems).toEqual([]);
  });
}

// Screens without a smoke test of their own until phase 5: rendered with a heading and without errors.
for (const path of [
  "/admin/produits/nouveau",
  "/admin/promotions/nouvelle",
  "/admin/promotions/apercu",
  "/admin/promotions/cartes-cadeaux/configuration",
  "/admin/promotions/campagnes/nouvelle",
  "/admin/formations/nouvelle",
]) {
  test(`back office: ${path} renders for signed-in staff`, async ({ page, problems }) => {
    await signInStaff(page);
    await open(page, path);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 30_000 });
    expect(new URL(page.url()).pathname).toBe(path);
    expect(problems).toEqual([]);
  });
}

test("back office: the rail and the lists' links are client-side navigations", async ({ page, problems }) => {
  await signInStaff(page);
  await open(page, "/admin");
  await page.evaluate(() => ((window as unknown as { gtMarker: number }).gtMarker = 1));
  const follow = async (selector: string) => {
    const link = page.locator(selector).first();
    await expect(link).toBeVisible({ timeout: 30_000 });
    const href = (await link.getAttribute("href"))!;
    await link.click();
    // A client-side navigation asks the server for the page's segment: compiled on first request by a dev server.
    await expect(page).toHaveURL((url) => url.pathname + url.search === href, { timeout: 30_000 });
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { gtMarker?: number }).gtMarker)).toBe(1);
  };
  await follow('aside a[href="/admin/produits"]');
  await follow('aside a[href="/admin/commandes"]');
  await follow('main a[href^="/admin/commandes/"]:visible');
  await follow('aside a[href="/admin/clients"]');
  await follow('main a[href^="/admin/clients/"]:visible');
  await page.waitForLoadState("networkidle");
  expect(problems).toEqual([]);
});

test("back office: signing in on the access screen opens the page asked for", async ({ page, problems }) => {
  await open(page, "/admin/produits");
  await expect(page).toHaveURL((url) => url.pathname === "/admin/connexion");
  await page.getByLabel(/e-mail/i).fill(STAFF.email);
  await page.getByRole("textbox", { name: "Mot de passe", exact: true }).fill("toothgems2026");
  await page.getByRole("button", { name: /se connecter/i }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/admin/produits");
  expect(problems).toEqual([]);
});

for (const [from, to] of [
  ["/studio-3d/share/abc", "/studio-3d/partage/abc"],
  ["/studio-3d/editor", "/studio-3d/atelier"],
  ["/studio-3d/editor/groups", "/studio-3d/atelier/mes-groupes"],
]) {
  test(`Studio alias ${from} moves to ${to}`, async ({ page, problems }) => {
    await page.goto(from);
    // The Studio zone's first compilation on a dev server can take a while.
    await expect(page).toHaveURL((url) => url.pathname === to, { timeout: 30_000 });
    await expect(page.locator("main#main")).toBeVisible({ timeout: 30_000 });
    await page.waitForLoadState("networkidle");
    expect(problems).toEqual([]);
  });
}

test("a link to another zone loads it, and the back button returns", async ({ page, problems }) => {
  await signInMember(page);
  await open(page, "/fr/boutique");
  await dismissCookieBanner(page);
  await page.getByRole("link", { name: "Mon espace" }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/compte");
  await expect(page.locator("main#main")).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.goBack();
  await expect(page).toHaveURL((url) => url.pathname === "/fr/boutique");
  await expect(page.getByRole("heading", { level: 1 }).first()).toHaveText(/Gems, outils et kits professionnels/);
  await page.waitForLoadState("networkidle");
  expect(problems).toEqual([]);
});
test("the Studio aliases are moved by the server, the shared design's fragment kept", async ({ page, request }) => {
  const response = await request.get("/studio-3d/share/abc?x=1", { maxRedirects: 0 });
  expect(response.status()).toBe(308);
  expect(response.headers().location).toMatch(/\/studio-3d\/partage\/abc\?x=1$/);
  await page.goto("/studio-3d/share#design");
  await expect(page).toHaveURL((url) => url.pathname === "/studio-3d/partage" && url.hash === "#design", { timeout: 30_000 });
});

test("learner pages: opening a lesson from the course stays on the page (client-side navigation)", async ({ page, problems }) => {
  await signInMember(page);
  await open(page, "/academy/mes-formations/fondation");
  await dismissCookieBanner(page);
  const lesson = page.locator('main a[href^="/academy/mes-formations/fondation/lecon/"]').first();
  await expect(lesson).toBeVisible({ timeout: 30_000 });
  const href = await lesson.getAttribute("href");
  await page.evaluate(() => ((window as unknown as { gtMarker: number }).gtMarker = 1));
  await lesson.click();
  // A client-side navigation asks the server for the page's segment: compiled on first request by a dev server.
  await expect(page).toHaveURL((url) => url.pathname === href, { timeout: 30_000 });
  expect(await page.evaluate(() => (window as unknown as { gtMarker?: number }).gtMarker)).toBe(1);
  await page.waitForLoadState("networkidle");
  expect(problems).toEqual([]);
});

test("links between zones are client-side navigations (phase 5)", async ({ page, problems }) => {
  await signInMember(page);
  await open(page, "/fr/boutique");
  await dismissCookieBanner(page);
  await page.evaluate(() => ((window as unknown as { gtMarker: number }).gtMarker = 1));
  const marker = () => page.evaluate(() => (window as unknown as { gtMarker?: number }).gtMarker);
  await page.getByRole("link", { name: "Mon espace" }).click();
  // A client-side navigation asks the server for the page's segment: compiled on first request by a dev server.
  await expect(page).toHaveURL((url) => url.pathname === "/compte", { timeout: 30_000 });
  await expect(page.getByRole("heading", { level: 1 }).first()).toHaveText(/^Bonjour Camille Roussel$/);
  expect(await marker()).toBe(1);
  await page.goBack();
  await expect(page).toHaveURL((url) => url.pathname === "/fr/boutique", { timeout: 30_000 });
  await expect(page.getByRole("heading", { level: 1 }).first()).toHaveText(/Gems, outils et kits professionnels/);
  expect(await marker()).toBe(1);
  await page.waitForLoadState("networkidle");
  expect(problems).toEqual([]);
});

test("the sign-in page's former address is moved by the server", async ({ request }) => {
  const response = await request.get("/connexion-b?suite=%2Fcompte", { maxRedirects: 0 });
  expect(response.status()).toBe(308);
  expect(response.headers().location).toMatch(/\/connexion\?suite=%2Fcompte$/);
});

test("the cart is kept when the visitor goes through another zone", async ({ page, problems }) => {
  await open(page, "/fr/boutique/opale");
  await dismissCookieBanner(page);
  const product = await page.getByRole("heading", { level: 1 }).first().innerText();
  await page.getByRole("button", { name: /ajouter au panier/i }).click();

  await open(page, "/studio-3d/partage");
  await open(page, "/fr/panier");
  await expect(page.getByRole("listitem").filter({ hasText: product })).toBeVisible();
  expect(problems).toEqual([]);
});

test("a signed-out visitor sent to sign in comes back to the member page asked for", async ({ page, problems }) => {
  await open(page, "/compte/commandes");
  await expect(page).toHaveURL((url) => url.pathname === "/connexion");
  await dismissCookieBanner(page);
  const main = page.locator("main#main");
  await main.getByLabel(/e-mail/i).fill(MEMBER.email);
  await main.getByLabel(/^mot de passe$/i).fill("Smoke-Test-2026!");
  await main.getByRole("button", { name: /^se connecter$/i }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/compte/commandes");
  await expect(page.locator("main#main")).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(problems).toEqual([]);
});

test("public pages do not download the back office's code", async ({ page, baseURL }) => {
  const scripts = async (path: string) => {
    const urls = new Map<string, number>();
    const listener = async (response: import("@playwright/test").Response) => {
      if (!response.url().startsWith(baseURL!) || !/\.js(\?|$)/.test(response.url())) return;
      try {
        urls.set(response.url(), (await response.body()).length);
      } catch {
        // A body no longer available: counted as nothing.
      }
    };
    page.on("response", listener);
    await open(page, path);
    page.off("response", listener);
    return urls;
  };
  const publicScripts = await scripts("/fr");
  const adminScripts = await scripts("/admin/connexion");
  const adminOnly = [...adminScripts].filter(([url]) => !publicScripts.has(url));
  const adminOnlyBytes = adminOnly.reduce((sum, [, bytes]) => sum + bytes, 0);
  // The back office's screens are hundreds of kB: none of it on the home page.
  expect(adminOnlyBytes).toBeGreaterThan(300_000);
});
