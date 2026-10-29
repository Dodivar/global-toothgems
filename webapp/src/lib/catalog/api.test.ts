import { describe, expect, it, vi } from "vitest";
import { fetchCatalog } from "./api";
import type { TypedSupabaseClient } from "../supabase/client";

/**
 * A database without the variant options migration: any product query naming
 * `product_options` fails, the others answer with no rows.
 */
function databaseWithoutOptions(failAlways = false) {
  const selects: string[] = [];
  const db = {
    from: () => {
      let select = "";
      const query = {
        select: (columns: string) => {
          select = columns;
          selects.push(columns);
          return query;
        },
        eq: () => query,
        neq: () => query,
        order: () => query,
        then: (resolve: (value: unknown) => unknown) =>
          resolve(
            failAlways || select.includes("product_options")
              ? { data: null, error: { message: "relation missing" } }
              : { data: [], error: null },
          ),
      };
      return query;
    },
  };
  return { db: db as unknown as TypedSupabaseClient, selects: () => selects.filter((s) => s.includes("product_variants")) };
}

describe("fetchCatalog fallbacks", () => {
  it("keeps the families when only the variant options are missing", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { db, selects } = databaseWithoutOptions();
    await expect(fetchCatalog(undefined, db)).resolves.toEqual([]);
    const [first, second] = selects();
    expect(selects()).toHaveLength(2);
    expect(first).toContain("product_options");
    expect(second).not.toContain("product_options");
    expect(second).toContain("category_families");
  });

  it("ends without the families, and surfaces a real outage", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { db, selects } = databaseWithoutOptions(true);
    await expect(fetchCatalog(undefined, db)).rejects.toMatchObject({ message: "relation missing" });
    expect(selects()).toHaveLength(3);
    expect(selects()[2]).not.toContain("category_families");
  });
});
