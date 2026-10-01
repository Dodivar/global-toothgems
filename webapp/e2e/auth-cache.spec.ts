import { expect, test } from "@playwright/test";

/**
 * The catalogue cache of phase 3.2 (docs/migration-nextjs.md): the Next.js
 * server reads the catalogue once for many page renders. The fake Supabase
 * (e2e/support/fake-supabase.mjs) counts every server read, whichever test
 * caused it, so this project runs after the `auth-server` tests
 * (`playwright.config.ts`): run alongside them, their product addresses were
 * counted too.
 */

test("the server reads the catalogue once for many page renders (cache)", async ({ request }) => {
  const reads = async () => (await (await request.get("http://localhost:54399/__server-reads")).json()) as Record<string, number>;
  // Fills the cache, if no earlier test did. An entry filled more than the
  // cache's lifetime ago is served stale and read again in the background
  // after the response: wait until the reads settle.
  let before = await reads();
  for (let attempt = 0; attempt < 10; attempt++) {
    await request.get("/en/shop");
    await new Promise((resolve) => setTimeout(resolve, 500));
    const now = await reads();
    if (JSON.stringify(now) === JSON.stringify(before)) break;
    before = now;
  }
  for (const path of ["/en/shop", "/fr/boutique", "/fr", "/fr/formes", "/en/shop"]) {
    expect((await request.get(path)).status(), path).toBe(200);
  }
  const after = await reads();
  for (const table of ["products", "gem_colors", "categories", "courses"]) expect(after[table] ?? 0, table).toBe(before[table] ?? 0);
  // The count does see server reads: a key never asked before is read from the database.
  expect((await request.get(`/fr/boutique/inconnu-${Date.now()}`)).status()).toBe(404);
  expect((await reads()).products ?? 0).toBeGreaterThan(after.products ?? 0);
});
