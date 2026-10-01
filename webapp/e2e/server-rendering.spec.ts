import { expect, open, test } from "./fixtures";

/**
 * Public pages rendered on the server (phase 3.2 of docs/migration-nextjs.md):
 * their content is in the HTML the server sends, in the language of the
 * address, and the browser hydrates it without a mismatch — also for a
 * visitor whose browser already holds choices the server cannot see.
 */
const SERVER_RENDERED: { path: string; text: string }[] = [
  { path: "/fr", text: "tooth gems, Academy et Studio 3D" },
  { path: "/en", text: "tooth gems, Academy and 3D Studio" },
  { path: "/fr/boutique", text: "Gems, outils et kits professionnels" },
  { path: "/en/shop?categorie=gems", text: "Gems, tools and professional kits" },
  { path: "/fr/boutique/aurora-heart", text: "Aurora Heart" },
  { path: "/fr/formes", text: "Toutes les formes de gems" },
  { path: "/en/colours", text: "Every gem colour" },
  { path: "/fr/fidelite", text: "Vos récompenses" },
  { path: "/en/3d-studio", text: "Create your own tooth jewellery" },
  { path: "/fr/academy/formation/fondation", text: "Fondation Tooth Gem" },
  { path: "/en/help/faq", text: "Frequently asked questions" },
  { path: "/fr/mentions-legales", text: "Mentions légales" },
  { path: "/en/privacy-policy", text: "Privacy policy" },
];

test("public pages send their content in the HTML", async ({ request }) => {
  for (const { path, text } of SERVER_RENDERED) {
    const html = await (await request.get(path)).text();
    // The heading is there before any script runs, with the page's own chrome.
    expect(html, path).toMatch(new RegExp(`<h1[^>]*>(?:(?!</h1>).)*${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "s"));
    expect(html, path).toContain('<header');
    expect(html, path).toContain('<footer');
  }
});

test("links in the server HTML are the addresses of the page's language", async ({ request }) => {
  const html = await (await request.get("/en/help")).text();
  expect(html).toContain('href="/en/shop"');
  expect(html).not.toContain('href="/boutique"');
});

test("a returning visitor's saved choices hydrate without a mismatch", async ({ page, problems }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    localStorage.setItem("gt-cookie-consent", JSON.stringify({ preferences: false, analytics: false, marketing: false, decidedAt: "2026-09-01T00:00:00Z" }));
    localStorage.setItem("gt-review-notes", "off");
    localStorage.setItem("gt-launch-checklist", JSON.stringify({ "stripe-account": true }));
  });
  for (const path of ["/fr/academy", "/fr/cookies", "/en/legal-notice", "/fr/boutique/aurora-heart"]) {
    await open(page, path);
    await expect(page.getByRole("button", { name: /refuser les non essentiels|reject non-essential/i })).toHaveCount(0);
  }
  expect(problems).toEqual([]);
});
