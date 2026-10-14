import { ACCOUNTS, anonClient, DEMO_MEMBER_ID, serviceClient, signedInClient, testPassword } from "./env";
import { dismissCookieBanner, expect, open, signIn, test } from "./fixtures";

/**
 * Critical journeys against a REAL backend: the local Supabase stack with
 * every migration, seed.sql and seed_demo_member.sql. Unlike the smoke tests
 * (mock mode, e2e/), the catalogue, the sessions and every refusal here come
 * from Supabase Auth, Postgres and RLS. Where a refusal matters, it is also
 * checked directly against the database API with the account's own token,
 * since a hidden button or a redirect proves nothing about authorization.
 *
 * Not covered here (see docs/testing.md): paying. The Stripe Edge Functions
 * need Stripe test keys, which CI does not hold; create_order(),
 * mark_order_paid() and the webhook are covered by the SQL suites and by
 * `deno test` (signatures made with the real Stripe SDK).
 */

/** The demo member's orders, as the database has them. */
async function demoOrders() {
  const { data, error } = await serviceClient().from("orders").select("id, order_number, status").eq("user_id", DEMO_MEMBER_ID).order("created_at");
  if (error) throw new Error(error.message);
  expect(data.length, "seed_demo_member.sql creates four orders").toBe(4);
  return data;
}

test.describe("storefront, read from the database", () => {
  test("the shop lists active products and hides drafts and archived ones", async ({ page, problems }) => {
    await open(page, "/fr/boutique");
    const main = page.locator("main#main");
    await expect(main.getByText("Étoile Cristal").first()).toBeVisible();
    await expect(main.getByText("Kit Découverte")).toHaveCount(0); // draft
    await expect(main.getByText("Coffret Glitter 2025")).toHaveCount(0); // archived
    expect(problems).toEqual([]);
  });

  test("a product page shows the database's name and price", async ({ page, problems }) => {
    await open(page, "/fr/boutique/etoile-cristal");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Étoile Cristal");
    await expect(page.locator("main#main").getByText(/^32\s?€$/).first()).toBeVisible();
    expect(problems).toEqual([]);
  });

  test("a draft product's address answers 404", async ({ request }) => {
    expect((await request.get("/fr/boutique/kit-decouverte")).status()).toBe(404);
    expect((await request.get("/fr/boutique/n-existe-pas")).status()).toBe(404);
  });

  test("an anonymous visitor reads no draft product through the API either", async () => {
    const { data, error } = await anonClient().from("products").select("slug").in("slug", ["kit-decouverte", "coffret-glitter-2025"]);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});

test.describe("sign-in and sessions", () => {
  test("a wrong password is refused and opens no session", async ({ page, problems }) => {
    await signIn(page, ACCOUNTS.customer, "/connexion", "Not-The-Password-1!");
    await expect(page.getByText("E-mail ou mot de passe incorrect")).toBeVisible();
    await expect(page).toHaveURL((url) => url.pathname === "/connexion");
    const response = await page.request.get("/compte", { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    // The failed sign-in is reported by Supabase Auth as a 400 on its own origin, not as an app error.
    expect(problems).toEqual([]);
  });

  test("a customer signs in, reaches the member area, then signs out", async ({ page, problems }) => {
    await signIn(page, ACCOUNTS.customer, "/connexion?suite=%2Fcompte");
    await expect(page).toHaveURL((url) => url.pathname === "/compte");
    // The server sees the cookie session too (proxy + zone layout).
    expect((await page.request.get("/compte", { maxRedirects: 0 })).status()).toBe(200);

    await page.getByRole("button", { name: /se déconnecter|déconnexion/i }).first().click();
    await expect.poll(async () => (await page.request.get("/compte", { maxRedirects: 0 })).status()).toBe(307);
    expect(problems).toEqual([]);
  });

  test("a signed-out visitor is sent from member pages to the sign-in page", async ({ request }) => {
    for (const path of ["/compte", "/compte/commandes", "/academy/lecon"]) {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status(), path).toBe(307);
      expect(response.headers().location, path).toContain("/connexion");
    }
  });
});

test.describe("back office access", () => {
  test("a customer is refused the back office, by the server", async ({ page, problems }) => {
    await signIn(page, ACCOUNTS.customer);
    await expect(page).not.toHaveURL((url) => url.pathname === "/connexion");
    const response = await page.request.get("/admin/commandes", { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    expect(response.headers().location).toContain("/admin/connexion");
    expect(problems).toEqual([]);
  });

  test("a customer cannot call staff functions or raise their own role through the API", async () => {
    const customer = await signedInClient(ACCOUNTS.customer, testPassword());
    const { data: me } = await customer.auth.getUser();

    const escalate = await customer.from("profiles").update({ role: "admin" }).eq("id", me.user!.id).select();
    expect(escalate.error, "the profiles guard trigger refuses a role change").not.toBeNull();
    const { data: profile } = await serviceClient().from("profiles").select("role").eq("id", me.user!.id).single();
    expect(profile?.role).toBe("customer");

    const staffOnly = await customer.rpc("staff_directory");
    expect(staffOnly.data).toBeNull();
    expect(staffOnly.error?.code).toBe("42501");
  });

  test("a staff member signs in to the back office and reads every order", async ({ page, problems }) => {
    await signIn(page, ACCOUNTS.staff, "/admin/connexion");
    await expect(page).toHaveURL((url) => url.pathname.startsWith("/admin") && url.pathname !== "/admin/connexion");
    const orders = await demoOrders();
    await open(page, "/admin/commandes");
    await expect(page.getByText(orders[0].order_number).first()).toBeVisible();
    expect(problems).toEqual([]);
  });
});

test.describe("orders belong to their customer", () => {
  test("the demo member sees their own orders", async ({ page, problems }) => {
    const orders = await demoOrders();
    await signIn(page, ACCOUNTS.demo, "/connexion?suite=%2Fcompte%2Fcommandes");
    await expect(page).toHaveURL((url) => url.pathname === "/compte/commandes");
    for (const order of orders) await expect(page.getByText(order.order_number).first()).toBeVisible();

    await open(page, `/compte/commandes/${orders[0].order_number}`);
    await expect(page.getByRole("heading", { level: 1 })).not.toHaveText("Commande introuvable");
    expect(problems).toEqual([]);
  });

  test("another customer opening the demo member's order reference gets 'not found'", async ({ page, problems }) => {
    const [order] = await demoOrders();
    await signIn(page, ACCOUNTS.customer);
    await expect(page).not.toHaveURL((url) => url.pathname === "/connexion");
    await open(page, `/compte/commandes/${order.order_number}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Commande introuvable");
    expect(problems).toEqual([]);
  });

  test("RLS hides another customer's orders, lines and addresses from the API", async () => {
    const orders = await demoOrders();
    const customer = await signedInClient(ACCOUNTS.customer, testPassword());
    const ids = orders.map((o) => o.id);

    for (const [table, column] of [
      ["orders", "id"],
      ["order_items", "order_id"],
    ] as const) {
      const { data, error } = await customer.from(table).select("*").in(column, ids);
      expect(error, table).toBeNull();
      expect(data, table).toEqual([]);
    }
    const addresses = await customer.from("customer_addresses").select("id").eq("user_id", DEMO_MEMBER_ID);
    expect(addresses.data ?? []).toEqual([]);

    // Nor can it change one.
    await customer.from("orders").update({ status: "cancelled" }).in("id", ids);
    const { data: after } = await serviceClient().from("orders").select("status").in("id", ids).order("created_at");
    expect(after?.map((o) => o.status)).toEqual(orders.map((o) => o.status));

    // And an anonymous visitor reads nothing at all.
    const anon = await anonClient().from("orders").select("id").in("id", ids);
    expect(anon.data ?? []).toEqual([]);
  });
});

test.describe("registration", () => {
  test("a visitor creates an account with the real sign-up, recorded by the database", async ({ page, problems }) => {
    const email = `e2e.signup.${Date.now()}.${test.info().workerIndex}@example.com`;
    const admin = serviceClient();
    try {
      await open(page, "/inscription");
      await dismissCookieBanner(page);
      await page.getByLabel(/adresse e-mail/i).fill(email);
      await page.getByLabel(/^mot de passe$/i).fill("Gemmes-Brillantes-2026!");
      await page.getByLabel(/confirmez le mot de passe/i).fill("Gemmes-Brillantes-2026!");
      await page.getByRole("button", { name: /^continuer$/i }).click();
      await page.getByLabel(/prénom/i).fill("Inès");
      await page.getByLabel(/^nom/i).fill("Nouvelle");
      await page.getByLabel(/pays/i).selectOption("FR");
      await page.getByRole("button", { name: /^continuer$/i }).click();
      const terms = page.locator("#reg-terms");
      await terms.dispatchEvent("click");
      await page.getByRole("button", { name: /créer mon compte/i }).click();
      await expect(page.getByRole("button", { name: /créer mon compte/i })).toHaveCount(0);

      // The outcome that matters is in the database: the account, its customer profile and the consent.
      await expect
        .poll(async () => (await admin.from("profiles").select("first_name, role").eq("email", email).maybeSingle()).data)
        .toEqual({ first_name: "Inès", role: "customer" });
      expect(problems).toEqual([]);
    } finally {
      const { data } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
      if (data) await admin.auth.admin.deleteUser(data.id);
    }
  });

  test("signing up again with a registered address creates no second account", async () => {
    const before = await serviceClient().from("profiles").select("id", { count: "exact", head: true }).eq("email", ACCOUNTS.customer);
    await anonClient().auth.signUp({ email: ACCOUNTS.customer, password: "Another-Password-2026!" });
    const after = await serviceClient().from("profiles").select("id", { count: "exact", head: true }).eq("email", ACCOUNTS.customer);
    expect(before.count).toBe(1);
    expect(after.count).toBe(1);
    // And the existing password still works: the second sign-up changed nothing.
    await signedInClient(ACCOUNTS.customer, testPassword());
  });
});
