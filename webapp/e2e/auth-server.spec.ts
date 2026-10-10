import { expect, test, type APIResponse } from "@playwright/test";

/**
 * The server-side auth plumbing of phase 2 (docs/migration-nextjs.md): the
 * proxy turning signed-out visitors away, `/auth/confirm` opening a cookie
 * session from an e-mail link, and the browser picking that session up —
 * against the fake Supabase of e2e/support/fake-supabase.mjs.
 */

const COOKIE = "sb-localhost-auth-token";

/** Where a response redirects to, as a path + query. */
function location(response: APIResponse): string {
  const value = response.headers()["location"];
  expect(value, `status ${response.status()} without a Location`).toBeTruthy();
  const url = new URL(value, "http://localhost");
  return url.pathname + url.search;
}

const noRedirect = { maxRedirects: 0 } as const;

test.describe("proxy", () => {
  for (const [path, target] of [
    ["/compte", "/connexion?suite=%2Fcompte"],
    ["/compte/commandes?page=2", "/connexion?suite=%2Fcompte%2Fcommandes%3Fpage%3D2"],
    ["/academy/lecon", "/connexion?suite=%2Facademy%2Flecon"],
    ["/academy/mes-formations/fondation/lecon/m1", "/connexion?suite=%2Facademy%2Fmes-formations%2Ffondation%2Flecon%2Fm1"],
    ["/admin", "/admin/connexion?suite=%2Fadmin"],
    ["/admin/produits/42", "/admin/connexion?suite=%2Fadmin%2Fproduits%2F42"],
    // Phase 4: every zone's own segment (the proxy, then the zone's layout and page).
    ["/compte/salons/en/discussion", "/connexion?suite=%2Fcompte%2Fsalons%2Fen%2Fdiscussion"],
    ["/academy/mes-formations/business/terminee", "/connexion?suite=%2Facademy%2Fmes-formations%2Fbusiness%2Fterminee"],
    ["/admin/avis?vue=signales", "/admin/connexion?suite=%2Fadmin%2Favis%3Fvue%3Dsignales"],
    // An order's detail page.
    ["/compte/commandes/GT-100001", "/connexion?suite=%2Fcompte%2Fcommandes%2FGT-100001"],
  ]) {
    test(`sends a signed-out visitor from ${path} to ${target.split("?")[0]}`, async ({ request }) => {
      const response = await request.get(path, noRedirect);
      expect(response.status()).toBe(307);
      expect(location(response)).toBe(target);
    });
  }

  for (const path of ["/fr", "/en/shop", "/connexion", "/admin/connexion", "/fr/academy/formation/pose-essentielle", "/fr/studio-3d", "/studio-3d/atelier", "/studio-3d/partage/abc"]) {
    test(`leaves ${path} open`, async ({ request }) => {
      const response = await request.get(path, noRedirect);
      expect(response.status()).toBe(200);
    });
  }

  test("does not trust a forged session cookie", async ({ request }) => {
    const forged = `base64-${Buffer.from(JSON.stringify({ access_token: "forged.token.value", refresh_token: "x", expires_at: 9999999999 })).toString("base64url")}`;
    const response = await request.get("/compte", { ...noRedirect, headers: { cookie: `${COOKIE}=${forged}` } });
    expect(response.status()).toBe(307);
    expect(location(response)).toBe("/connexion?suite=%2Fcompte");
  });
});

test.describe("/auth/confirm", () => {
  test("opens a session from a valid link and the proxy then lets the member in", async ({ request }) => {
    const next = "/confirmation-compte?suite=%2Fpanier";
    const response = await request.get(`/auth/confirm?token_hash=valid-signup&type=signup&next=${encodeURIComponent(next)}`, noRedirect);
    expect(response.status()).toBe(303);
    expect(location(response)).toBe(next);
    expect(response.headers()["set-cookie"]).toContain(`${COOKIE}=`);

    // The request context keeps the cookies it was given.
    const account = await request.get("/compte", noRedirect);
    expect(account.status()).toBe(200);
    // The member's private zones let the member in.
    for (const path of ["/compte/salons", "/academy/lecon"]) {
      expect((await request.get(path, noRedirect)).status(), path).toBe(200);
    }
    // The back office does not: a signed-in account that is not staff is sent
    // to its access screen (decided 2026-10-01), by the page's own check.
    const admin = await request.get("/admin/produits?vue=archives", noRedirect);
    expect(admin.status()).toBe(307);
    expect(location(admin)).toBe("/admin/connexion?suite=%2Fadmin%2Fproduits%3Fvue%3Darchives");
    expect((await request.get("/admin/connexion", noRedirect)).status()).toBe(200);
  });

  test("lets an active staff member into the back office", async ({ request }) => {
    const response = await request.get("/auth/confirm?token_hash=valid-staff&type=signup&next=%2Fadmin", noRedirect);
    expect(location(response)).toBe("/admin");
    for (const path of ["/admin", "/admin/produits", "/admin/commandes/GT-1", "/compte"]) {
      expect((await request.get(path, noRedirect)).status(), path).toBe(200);
    }
  });

  test("lands a password-recovery link on the reset page by default", async ({ request }) => {
    const response = await request.get("/auth/confirm?token_hash=valid-recovery&type=recovery", noRedirect);
    expect(location(response)).toBe("/reinitialiser-mot-de-passe");
  });

  test("reports an expired link to the landing page", async ({ request }) => {
    const response = await request.get("/auth/confirm?token_hash=expired&type=recovery&next=%2Freinitialiser-mot-de-passe", noRedirect);
    expect(location(response)).toBe("/reinitialiser-mot-de-passe?error=access_denied&error_code=otp_expired");
    expect(response.headers()["set-cookie"] ?? "").not.toContain(`${COOKIE}=`);
  });

  test("forwards an error Supabase reported before redirecting", async ({ request }) => {
    const response = await request.get("/auth/confirm?next=%2Fconfirmation-compte&error=access_denied&error_code=otp_expired", noRedirect);
    expect(location(response)).toBe("/confirmation-compte?error=access_denied&error_code=otp_expired");
  });

  test("tells the e-mail change page when the other address must still confirm", async ({ request }) => {
    const response = await request.get("/auth/confirm?token_hash=halfway&type=email_change", noRedirect);
    expect(location(response)).toBe("/verifier-email?type=changement&message=confirm_other_address");
  });

  test("lands a team invitation on the page where the invitee chooses a password", async ({ request }) => {
    const response = await request.get("/auth/confirm?token_hash=valid-invite&type=invite&next=%2Freinitialiser-mot-de-passe", noRedirect);
    expect(location(response)).toBe("/reinitialiser-mot-de-passe");
  });

  test("refuses link kinds the app never sends and codes without their verifier", async ({ request }) => {
    const magic = await request.get("/auth/confirm?token_hash=valid-x&type=magiclink", noRedirect);
    expect(location(magic)).toBe("/confirmation-compte?error=access_denied&error_code=invalid_link");
    const code = await request.get("/auth/confirm?code=abc&next=%2Freinitialiser-mot-de-passe", noRedirect);
    expect(location(code)).toMatch(/^\/reinitialiser-mot-de-passe\?error=access_denied&error_code=/);
  });

  test("never redirects off the site", async ({ request }) => {
    for (const next of ["https://evil.example/x", "//evil.example", "/\\evil.example"]) {
      const response = await request.get(`/auth/confirm?token_hash=valid-signup&type=signup&next=${encodeURIComponent(next)}`, noRedirect);
      expect(location(response)).toBe("/confirmation-compte");
    }
  });
});

test.describe("browser session", () => {
  test("a member signed in before the move to cookies stays signed in", async ({ page, context, baseURL }) => {
    const now = Math.floor(Date.now() / 1000);
    // What supabase-js kept in localStorage before: a session this fake Auth accepts.
    const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const token = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: "00000000-0000-4000-8000-00000000e2e0", aud: "authenticated", role: "authenticated", exp: now + 3600, iat: now })}.e2e`;
    const legacy = { access_token: token, refresh_token: "e2e-refresh", token_type: "bearer", expires_in: 3600, expires_at: now + 3600, user: { id: "00000000-0000-4000-8000-00000000e2e0" } };
    await context.addInitScript(
      ([key, value]) => {
        if (!sessionStorage.getItem("seeded")) {
          localStorage.setItem(key, value);
          sessionStorage.setItem("seeded", "1");
        }
      },
      [COOKIE, JSON.stringify(legacy)] as const,
    );

    await page.goto("/connexion");
    await expect.poll(async () => (await context.cookies(baseURL)).some((c) => c.name.startsWith(COOKIE))).toBe(true);
    expect(await page.evaluate((key) => localStorage.getItem(key), COOKIE)).toBeNull();

    // The proxy now sees the session, and so does the member space.
    await page.goto("/compte");
    // The dashboard greets the member by the name of their profile row: the
    // client restored the cookie session, and did not send them to /connexion.
    await expect(page.getByRole("heading", { name: /Membre E2E/ })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/compte");
  });

  test("the sign-in page keeps the page the proxy turned the visitor away from", async ({ page }) => {
    await page.goto("/compte/commandes");
    await expect(page).toHaveURL((url) => url.pathname === "/connexion" && url.searchParams.get("suite") === "/compte/commandes");
    await expect(page.getByRole("heading", { level: 1 }).first()).toHaveText(/Connexion/);
  });
});

/*
 * Product addresses per language (phase 3.2): the fake Supabase sells one
 * product, `coeur-chrome` in French and `chrome-heart-tooth-gem` in English.
 */
test.describe("product addresses", () => {
  test("each language has its own slug; other keys move there, query kept", async ({ request }) => {
    for (const [from, to] of [
      ["/en/shop/coeur-chrome", "/en/shop/chrome-heart-tooth-gem"],
      ["/fr/boutique/chrome-heart-tooth-gem?couleur=or", "/fr/boutique/coeur-chrome?couleur=or"],
      ["/en/shop/00000000-0000-4000-8000-0000000000a1", "/en/shop/chrome-heart-tooth-gem"],
      ["/boutique/coeur-chrome", "/fr/boutique/coeur-chrome"],
    ]) {
      const response = await request.get(from, noRedirect);
      expect(response.status(), from).toBe(308);
      expect(location(response), from).toBe(to);
    }
    expect((await request.get("/fr/boutique/n-existe-pas")).status()).toBe(404);
  });

  test("the page points to the other language's slug", async ({ request }) => {
    const html = await (await request.get("/en/shop/chrome-heart-tooth-gem")).text();
    expect(html).toContain("<title>Chrome Heart · Global Toothgems</title>");
    expect(html).toContain('<meta name="description" content="A mirror-polished chrome heart."/>');
    expect(html).toMatch(/<link rel="alternate" hrefLang="fr" href="[^"]*\/fr\/boutique\/coeur-chrome"\/>/);
    expect(html).toMatch(/<link rel="canonical" href="[^"]*\/en\/shop\/chrome-heart-tooth-gem"\/>/);
    // Rendered on the server from the catalogue it read (phase 3.2).
    expect(html).toMatch(/<h1[^>]*>Chrome Heart<\/h1>/);
    const shop = await (await request.get("/en/shop")).text();
    expect(shop).toContain('href="/en/shop/chrome-heart-tooth-gem"');

    const sitemap = await (await request.get("/sitemap.xml")).text();
    expect(sitemap).toMatch(/<loc>[^<]*\/fr\/boutique\/coeur-chrome<\/loc>/);
    expect(sitemap).toMatch(/<loc>[^<]*\/en\/shop\/chrome-heart-tooth-gem<\/loc>/);
  });
});

test("product links and the language switch use each language's slug", async ({ page }) => {
  // What the smoke tests watch for (e2e/fixtures.ts), without cutting off the
  // fake Supabase, which runs on another origin: only the web fonts are.
  const problems: string[] = [];
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.fulfill({ status: 200, body: "", contentType: "text/css" }));
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => problems.push(`exception: ${error.message}`));
  await page.goto("/fr/boutique");
  await expect(page.locator("main a[href='/fr/boutique/coeur-chrome']").first()).toBeAttached();
  // As `open()` does: leaving while the page still loads cancels its requests (a logged error).
  await page.waitForLoadState("networkidle");
  await page.goto("/fr/boutique/coeur-chrome");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { level: 1 }).first()).toHaveText(/Cœur Chrome/);
  await page.getByRole("button", { name: "Afficher le site en anglais" }).first().click();
  await expect(page).toHaveURL((url) => url.pathname === "/en/shop/chrome-heart-tooth-gem");
  await expect(page.getByRole("heading", { level: 1 }).first()).toHaveText(/Chrome Heart/);
  await expect(page).toHaveTitle("Chrome Heart · Global Toothgems");
  // The server-rendered pages hydrated from the same catalogue, without a mismatch.
  expect(problems).toEqual([]);
});

/*
 * The Academy's public pages read from the database (phase B): the fake
 * Supabase publishes one course, `pose-essentielle` in French and
 * `essential-placement` in English, 300 € reduced to 240 €, with a cover.
 */
test.describe("course pages", () => {
  test("each language has its own slug; other keys move there, unknown ones are 404", async ({ request }) => {
    for (const [from, to] of [
      ["/en/academy/course/pose-essentielle", "/en/academy/course/essential-placement"],
      ["/fr/academy/formation/essential-placement?ref=x", "/fr/academy/formation/pose-essentielle?ref=x"],
      ["/fr/academy/formation/00000000-0000-4000-8000-0000000000b1", "/fr/academy/formation/pose-essentielle"],
    ]) {
      const response = await request.get(from, noRedirect);
      expect(response.status(), from).toBe(308);
      expect(location(response), from).toBe(to);
    }
    // The prototype's courses do not exist in a real project.
    expect((await request.get("/fr/academy/formation/fondation")).status()).toBe(404);
    expect((await request.get("/en/academy/course/n-existe-pas")).status()).toBe(404);
  });

  test("the page is the course's: head, structured data, price, outline, a real purchase", async ({ request }) => {
    const html = await (await request.get("/en/academy/course/essential-placement")).text();
    expect(html).toContain("<title>Essential placement · Global Toothgems</title>");
    expect(html).toContain('<meta name="description" content="The basic moves, step by step."/>');
    expect(html).toMatch(/<link rel="alternate" hrefLang="fr" href="[^"]*\/fr\/academy\/formation\/pose-essentielle"\/>/);
    expect(html).toMatch(/<meta property="og:image" content="[^"]*\/media\/formations\/00000000-0000-4000-8000-0000000000c0\?v=\d+"\/>/);
    const jsonLd = /<script type="application\/ld\+json">(.*?)<\/script>/.exec(html)?.[1];
    expect(JSON.parse(jsonLd ?? "{}")).toMatchObject({ "@type": "Course", name: "Essential placement", timeRequired: "PT1H35M" });
    // Rendered on the server from the published course.
    expect(html).toMatch(/<h1[^>]*>Essential placement<\/h1>/);
    expect(html).toContain("€240");
    expect(html).toContain("Prepare the enamel");
    expect(html).toContain("Pass mark 80%");
    // Sold through the cart (phase D), never a fake enrolment.
    expect(html).toContain("Buy this course");
    expect(html).not.toContain("Start this training");

    const sitemap = await (await request.get("/sitemap.xml")).text();
    expect(sitemap).toMatch(/<loc>[^<]*\/fr\/academy\/formation\/pose-essentielle<\/loc>/);
    expect(sitemap).toMatch(/<loc>[^<]*\/en\/academy\/course\/essential-placement<\/loc>/);
  });

  test("buying puts one seat in the cart, which asks a visitor to sign in", async ({ page }) => {
    const problems: string[] = [];
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.fulfill({ status: 200, body: "", contentType: "text/css" }));
    page.on("console", (message) => {
      if (message.type() === "error") problems.push(`console: ${message.text()}`);
    });
    page.on("pageerror", (error) => problems.push(`exception: ${error.message}`));
    await page.goto("/fr/academy/formation/pose-essentielle");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Acheter la formation" }).first().click();
    await expect(page).toHaveURL((url) => url.pathname === "/fr/panier");
    await expect(page.getByText("Pose essentielle").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Connectez-vous pour acheter une formation" })).toBeVisible();
    // Nothing to ship, and no payment before the visitor has an account.
    await expect(page.getByText(/Rien à expédier/)).toBeVisible();
    for (const pay of await page.getByRole("button", { name: /^Payer/ }).all()) await expect(pay).toBeDisabled();
    expect(problems).toEqual([]);
  });

  test("the catalogue, the header and the footer list the published courses", async ({ request }) => {
    const html = await (await request.get("/fr/academy")).text();
    expect(html).toContain('href="/fr/academy/formation/pose-essentielle"');
    expect(html).not.toContain("/academy/formation/fondation");
    const english = await (await request.get("/en/shop")).text();
    expect(english).toContain('href="/en/academy/course/essential-placement"');
  });

  test("the cover is served from the private bucket at a stable address", async ({ request }) => {
    const cover = await request.get("/media/formations/00000000-0000-4000-8000-0000000000c0?v=1");
    expect(cover.status()).toBe(200);
    expect(cover.headers()["content-type"]).toBe("image/png");
    expect(cover.headers()["cache-control"]).toContain("s-maxage=3600");
    expect((await request.get("/media/formations/00000000-0000-4000-8000-0000000000ff")).status()).toBe(404);
    expect((await request.get("/media/formations/not-an-id")).status()).toBe(404);
  });
});

test("course links and the language switch use each language's slug", async ({ page }) => {
  const problems: string[] = [];
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.fulfill({ status: 200, body: "", contentType: "text/css" }));
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => problems.push(`exception: ${error.message}`));
  await page.goto("/fr/academy/formation/pose-essentielle");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { level: 1 }).first()).toHaveText(/Pose essentielle/);
  await page.getByRole("button", { name: "Afficher le site en anglais" }).first().click();
  await expect(page).toHaveURL((url) => url.pathname === "/en/academy/course/essential-placement");
  await expect(page.getByRole("heading", { level: 1 }).first()).toHaveText(/Essential placement/);
  await expect(page).toHaveTitle("Essential placement · Global Toothgems");
  expect(problems).toEqual([]);
});
