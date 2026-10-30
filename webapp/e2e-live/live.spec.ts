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
  const { data, error } = await serviceClient()
    .from("orders")
    .select("id, order_number, status, payment_status")
    .eq("user_id", DEMO_MEMBER_ID)
    .order("created_at");
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

test.describe("cart, priced from the database", () => {
  test("a product added twice costs twice its database price, and can be removed", async ({ page, problems }) => {
    const { data: product } = await serviceClient().from("products").select("price").eq("slug", "etoile-cristal").single();
    expect(Number(product?.price)).toBe(32);

    await open(page, "/fr/boutique/etoile-cristal");
    await dismissCookieBanner(page);
    await page.getByRole("button", { name: /ajouter au panier/i }).first().click();
    await page.locator(".gt-cart-notice").getByRole("link", { name: /voir le panier/i }).click();
    await expect(page).toHaveURL((url) => url.pathname === "/fr/panier");
    await expect(page.getByRole("heading", { name: "Votre panier" })).toBeVisible();

    const line = page.getByRole("listitem").filter({ hasText: "Étoile Cristal" });
    await expect(line).toBeVisible();
    await line.getByRole("button", { name: /augmenter/i }).click();
    await expect(line.getByText("2", { exact: true })).toBeVisible();
    await expect(line.getByText(/^64\s?€$/).first()).toBeVisible();

    await line.getByRole("button", { name: /retirer/i }).click();
    await expect(page.getByRole("listitem").filter({ hasText: "Étoile Cristal" })).toHaveCount(0);
    expect(problems).toEqual([]);
  });
});

test.describe("sign-in and sessions", () => {
  test("a wrong password is refused and opens no session", async ({ page, problems }) => {
    const refused = page.waitForResponse((r) => r.url().includes("/auth/v1/token") && r.request().method() === "POST");
    await signIn(page, ACCOUNTS.customer, "/connexion", "Not-The-Password-1!");
    expect((await refused).status()).toBe(400);
    await expect(page.getByText("E-mail ou mot de passe incorrect")).toBeVisible();
    await expect(page).toHaveURL((url) => url.pathname === "/connexion");
    const response = await page.request.get("/compte", { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    // Supabase Auth's refusal is the only failed request, and the app raised no error of its own.
    expect(problems).toEqual(["Supabase HTTP 400: /auth/v1/token"]);
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
  test("the demo member sees their paid orders, not the unpaid one", async ({ page, problems }) => {
    const orders = await demoOrders();
    // The history lists paid (or refunded) orders only (CUSTOMER_VISIBLE_PAYMENT_STATUSES, lib/orderMapping.ts).
    const visible = orders.filter((o) => ["paid", "refunded", "partially_refunded"].includes(o.payment_status));
    const hidden = orders.filter((o) => !visible.includes(o));
    expect(visible.length, "seed_demo_member.sql pays three of its four orders").toBe(3);
    await signIn(page, ACCOUNTS.demo, "/connexion?suite=%2Fcompte%2Fcommandes");
    await expect(page).toHaveURL((url) => url.pathname === "/compte/commandes");
    for (const order of visible) await expect(page.getByText(order.order_number).first()).toBeVisible();
    for (const order of hidden) await expect(page.getByText(order.order_number)).toHaveCount(0);

    await open(page, `/compte/commandes/${visible[0].order_number}`);
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

test.describe("kits, stock derived from their products (decision 117)", () => {
  test("a staff member makes a product a kit; its stock follows its products", async ({ page, problems }) => {
    const db = serviceClient();
    const tag = Date.now().toString(36).toUpperCase();
    const { data: category } = await db.from("categories").select("id").eq("is_active", true).order("position").limit(1).single();
    const insert = async (name: string, stock: number) => {
      const { data, error } = await db
        .from("products")
        .insert({
          name, slug: `e2e-kit-${tag.toLowerCase()}-${stock}`, sku: `E2E-KIT-${tag}-${stock}`, category_id: category!.id,
          price: 9, currency: "EUR", status: "draft", product_type: "physical",
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      const english = await db.from("product_translations").insert({ product_id: data.id, locale: "en", name, status: "published" });
      if (english.error) throw new Error(english.error.message);
      const stockRow = await db.from("inventory_items").insert({ product_id: data.id, quantity_on_hand: stock });
      if (stockRow.error) throw new Error(stockRow.error.message);
      return data.id as string;
    };
    const glossA = await insert(`Gloss A ${tag}`, 10);
    const glossB = await insert(`Gloss B ${tag}`, 4);
    const trio = await insert(`Trio ${tag}`, 7);

    try {
      await signIn(page, ACCOUNTS.staff, "/admin/connexion");
      await expect(page).toHaveURL((url) => url.pathname.startsWith("/admin") && url.pathname !== "/admin/connexion");
      await open(page, `/admin/produits/${trio}`);

      await page.getByText("Ce produit est un kit", { exact: true }).click();
      await expect(page.getByRole("switch", { name: "Ce produit est un kit" })).toBeChecked();
      // Its own 7 units are replaced by the calculation: the form says so.
      await expect(page.getByText(/7 unités en stock propre/)).toBeVisible();
      const picker = page.getByRole("group", { name: "Produits du kit" });
      await picker.getByRole("searchbox").fill(tag);
      await picker.getByRole("checkbox", { name: new RegExp(`Gloss A ${tag}`) }).check();
      await picker.getByRole("checkbox", { name: new RegExp(`Gloss B ${tag}`) }).check();
      const quantityB = page.getByRole("spinbutton", { name: `Quantité de Gloss B ${tag} par kit` });
      await quantityB.fill("2");
      // 10 A and 4 B ÷ 2 per kit: 2 kits, held down by B.
      await expect(page.getByText(`Stock calculé : 2 kits réalisables (limité par Gloss B ${tag}).`)).toBeVisible();
      await page.getByRole("button", { name: "Enregistrer les modifications" }).click();

      await expect
        .poll(async () => (await db.from("inventory_items").select("quantity_on_hand").eq("product_id", trio).single()).data?.quantity_on_hand)
        .toBe(2);
      const { data: rows } = await db
        .from("product_bundle_items")
        .select("component_product_id, quantity")
        .eq("bundle_product_id", trio)
        .order("position");
      expect(rows).toEqual([
        { component_product_id: glossA, quantity: 1 },
        { component_product_id: glossB, quantity: 2 },
      ]);

      // Restocking a product moves the kit; the kit itself has no count to change.
      const staff = await signedInClient(ACCOUNTS.staff, testPassword());
      const restock = await staff.rpc("admin_adjust_stock", { p_product_id: glossB, p_variant_id: null as unknown as string, p_delta: 4 });
      expect(restock.error).toBeNull();
      const { data: kit } = await db.from("inventory_items").select("quantity_on_hand").eq("product_id", trio).single();
      expect(kit?.quantity_on_hand).toBe(4);
      const refused = await staff.rpc("admin_adjust_stock", { p_product_id: trio, p_variant_id: null as unknown as string, p_delta: 5 });
      expect(refused.error?.hint).toBe("bundle");

      expect(problems).toEqual([]);
    } finally {
      await db.from("products").delete().eq("id", trio);
      await db.from("products").delete().in("id", [glossA, glossB]);
    }
  });
});
