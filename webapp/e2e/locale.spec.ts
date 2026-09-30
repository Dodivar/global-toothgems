import { dismissCookieBanner, expect, open, test } from "./fixtures";

/**
 * Language in the address (phase 3 of docs/migration-nextjs.md): `/fr/…` and
 * `/en/…` with English path segments, `/` negotiated, old addresses moved,
 * the `<head>` of each public page, and the language switch.
 */

const ENGLISH_PAGES: { path: string; heading: RegExp; title: string }[] = [
  { path: "/en", heading: /tooth gems, Academy and 3D Studio/, title: "Global Toothgems — tooth gems, Academy and 3D Studio" },
  { path: "/en/shop", heading: /Gems, tools and professional kits/, title: "Gems, tools and professional kits · Global Toothgems" },
  { path: "/en/shop/aurora-heart", heading: /Aurora Heart/, title: "Aurora Heart · Global Toothgems" },
  { path: "/en/academy/course/fondation", heading: /Tooth Gem/, title: "Global Toothgems" },
  { path: "/en/help/faq", heading: /Frequently asked questions/, title: "Frequently asked questions · Global Toothgems" },
  { path: "/en/terms-of-sale", heading: /Terms/, title: "Terms of sale · Global Toothgems" },
];

for (const { path, heading, title } of ENGLISH_PAGES) {
  test(`${path} is the English page`, async ({ page, problems }) => {
    await open(page, path);
    await expect(page.getByRole("heading", { level: 1 }).first()).toHaveText(heading);
    await expect(page).toHaveTitle(title);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    expect(new URL(page.url()).pathname).toBe(path);
    expect(problems).toEqual([]);
  });
}

test.describe("the home address", () => {
  for (const [acceptLanguage, cookie, target] of [
    ["fr-FR,fr;q=0.9,en;q=0.8", "", "/fr"],
    ["en-GB,en;q=0.9", "", "/en"],
    ["de-DE,de;q=0.9", "", "/en"],
    ["de-DE,de;q=0.9,fr;q=0.5", "", "/fr"],
    ["en-US", "gt-lang=fr", "/fr"],
    ["fr-FR", "gt-lang=en", "/en"],
  ]) {
    test(`goes to ${target} for "${acceptLanguage}"${cookie ? ` with ${cookie}` : ""}`, async ({ request }) => {
      const response = await request.get("/?ref=x", {
        maxRedirects: 0,
        headers: { "accept-language": acceptLanguage, ...(cookie ? { cookie } : {}) },
      });
      expect(response.status()).toBe(307);
      expect(new URL(response.headers()["location"], "http://localhost").pathname).toBe(target);
      expect(response.headers()["location"]).toContain("?ref=x");
    });
  }
});

test("old addresses are moved permanently, query included", async ({ request }) => {
  for (const [from, to] of [
    ["/boutique?categorie=gems", "/fr/boutique?categorie=gems"],
    ["/boutique/aurora-heart", "/fr/boutique/aurora-heart"],
    ["/aide/faq", "/fr/aide/faq"],
    ["/help", "/en/help"],
    ["/gift-card", "/en/gift-card"],
  ]) {
    const response = await request.get(from, { maxRedirects: 0 });
    expect(response.status(), from).toBe(308);
    const location = new URL(response.headers()["location"], "http://localhost");
    expect(location.pathname + location.search, from).toBe(to);
  }
});

test("the server answers 404 for addresses without a page", async ({ request }) => {
  for (const path of ["/fr/nimporte-quoi", "/en/boutique", "/fr/compte", "/nimporte-quoi", "/fr/boutique/n-existe-pas", "/en/shop/n-existe-pas"]) {
    expect((await request.get(path)).status(), path).toBe(404);
  }
  for (const path of ["/fr/boutique", "/en/shop/aurora-heart", "/connexion", "/compte", "/admin/produits"]) {
    expect((await request.get(path, { maxRedirects: 0 })).status(), path).toBe(200);
  }
});

test("public pages carry their canonical, hreflang and description; private ones are noindex", async ({ request }) => {
  const faq = await (await request.get("/fr/aide/faq")).text();
  expect(faq).toMatch(/<link rel="canonical" href="http:\/\/localhost:\d+\/fr\/aide\/faq"\/>/);
  expect(faq).toMatch(/<link rel="alternate" hrefLang="en" href="[^"]*\/en\/help\/faq"\/>/);
  expect(faq).toMatch(/<link rel="alternate" hrefLang="x-default" href="[^"]*\/en\/help\/faq"\/>/);
  expect(faq).toMatch(/<meta name="description" content="Commandes, produits, livraison/);
  expect(faq).toContain('<html lang="fr"');
  expect(faq).not.toContain("noindex");

  const signIn = await (await request.get("/connexion")).text();
  expect(signIn).toContain('<meta name="robots" content="noindex, nofollow"/>');
});

test("a product page is titled and described by its product, with structured data", async ({ request }) => {
  const html = await (await request.get("/fr/boutique/aurora-heart")).text();
  expect(html).toContain("<title>Aurora Heart · Global Toothgems</title>");
  expect(html).toMatch(/<link rel="canonical" href="[^"]*\/fr\/boutique\/aurora-heart"\/>/);
  expect(html).toMatch(/<link rel="alternate" hrefLang="en" href="[^"]*\/en\/shop\/aurora-heart"\/>/);
  expect(html).toMatch(/<meta property="og:image" content="[^"]+"\/>/);
  const jsonLd = /<script type="application\/ld\+json">(.*?)<\/script>/.exec(html)?.[1];
  expect(JSON.parse(jsonLd ?? "{}")).toMatchObject({
    "@type": "Product",
    name: "Aurora Heart",
    url: expect.stringMatching(/\/fr\/boutique\/aurora-heart$/),
    offers: { "@type": "Offer", price: "49.00", priceCurrency: "EUR" },
  });
});

test("sitemap and robots.txt list the public pages and keep private areas out", async ({ request }) => {
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toMatch(/<loc>[^<]*\/fr\/boutique<\/loc>/);
  expect(sitemap).toMatch(/<loc>[^<]*\/en\/shop<\/loc>/);
  expect(sitemap).toMatch(/<loc>[^<]*\/fr\/boutique\/aurora-heart<\/loc>/);
  expect(sitemap).toMatch(/<loc>[^<]*\/en\/shop\/aurora-heart<\/loc>/);
  expect(sitemap).not.toMatch(/panier|\/cart<|compte|admin/);
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Disallow: /compte");
  expect(robots).toContain("Disallow: /admin");
});

test("the language switch moves to the same page in the other language and is remembered", async ({ page, context, problems, baseURL }) => {
  await open(page, "/fr/boutique");
  await dismissCookieBanner(page);
  await expect(page.locator("header a[href='/fr/boutique']").first()).toBeAttached();

  await page.getByRole("button", { name: "Afficher le site en anglais" }).first().click();
  await expect(page).toHaveURL((url) => url.pathname === "/en/shop");
  await expect(page.getByRole("heading", { level: 1 }).first()).toHaveText(/Gems, tools and professional kits/);
  await expect(page).toHaveTitle("Gems, tools and professional kits · Global Toothgems");
  expect((await context.cookies(baseURL)).find((c) => c.name === "gt-lang")?.value).toBe("en");

  // Links now lead to English addresses, and back returns to French.
  await expect(page.locator("main article a[href^='/en/shop/']").first()).toBeAttached();
  await page.locator("main article a[href^='/en/shop/']").first().click();
  await expect(page).toHaveURL((url) => url.pathname.startsWith("/en/shop/"));
  await page.goBack();
  await expect(page).toHaveURL((url) => url.pathname === "/en/shop");
  expect(problems).toEqual([]);
});

test("the back button restores the language of the address", async ({ page, problems }) => {
  await open(page, "/fr/aide");
  await page.goto("/en/help/faq");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.goBack();
  await expect(page).toHaveURL((url) => url.pathname === "/fr/aide");
  await expect(page.getByRole("heading", { level: 1 }).first()).toHaveText(/Centre d’aide/);
  expect(problems).toEqual([]);
});

test("opening an English link does not change a saved French choice", async ({ page, context, baseURL, request }) => {
  await context.addCookies([{ name: "gt-lang", value: "fr", url: baseURL! }]);
  await open(page, "/en/shop");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  expect((await context.cookies(baseURL)).find((c) => c.name === "gt-lang")?.value).toBe("fr");
  const home = await request.get("/", { maxRedirects: 0, headers: { cookie: "gt-lang=fr", "accept-language": "en" } });
  expect(new URL(home.headers()["location"], "http://localhost").pathname).toBe("/fr");
});
