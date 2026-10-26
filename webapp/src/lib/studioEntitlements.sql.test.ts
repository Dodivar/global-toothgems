import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { countLimit, lowestPlanWith } from "./studioEntitlements";

/**
 * The browser's plan table (`STUDIO_PLAN_FEATURES`) is display only; the
 * database enforces the same rules. This reads the LATEST definition of each
 * enforcing function in `supabase/migrations/` and checks both say the same,
 * so neither can drift alone (decision 113).
 */
const MIGRATIONS = join(__dirname, "../../../supabase/migrations");

function latestDefinition(fn: string): string {
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
  const pattern = new RegExp(`create or replace function ${fn.replace(".", "\\.")}\\([\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$`, "gi");
  let body: string | null = null;
  for (const file of files) {
    for (const match of readFileSync(join(MIGRATIONS, file), "utf8").matchAll(pattern)) body = match[1];
  }
  if (body === null) throw new Error(`${fn} is defined in no migration`);
  return body.replace(/\s+/g, " ");
}

/** The tiers a `studio_user_tier(...) = '…'` / `in (…)` test lets through. */
function tiersAllowed(body: string): string[] {
  const eq = body.match(/studio_user_tier\(.*?\) = '(\w+)'/);
  if (eq) return [eq[1]];
  const list = body.match(/studio_user_tier\(.*?\) in \(([^)]*)\)/);
  if (list) return [...list[1].matchAll(/'(\w+)'/g)].map((m) => m[1]);
  throw new Error(`no tier test in: ${body}`);
}

/** The tiers from `tier` up. */
const fromTier = (tier: string | null) => (tier ? ["essential", "artist", "atelier"].slice(["essential", "artist", "atelier"].indexOf(tier)) : []);

describe("the plan table matches the database", () => {
  it("saved-content numbers (private.studio_plan_limit)", () => {
    const body = latestDefinition("private.studio_plan_limit");
    for (const tier of ["essential", "artist"] as const) {
      const branch = body.match(new RegExp(`when '${tier}' then case p_kind when 'creations' then (\\d+) when 'gem_groups' then (\\d+)`));
      expect(branch, tier).not.toBeNull();
      expect(Number(branch![1])).toBe(countLimit(tier, "creations"));
      expect(Number(branch![2])).toBe(countLimit(tier, "gemGroups"));
    }
    expect(body).not.toMatch(/when 'atelier'/);
    expect(countLimit("atelier", "creations")).toBeNull();
  });

  it("the Glowbook (private.glowbook_allowed)", () => {
    expect(tiersAllowed(latestDefinition("private.glowbook_allowed"))).toEqual(fromTier(lowestPlanWith("glowbook")));
  });

  it("the AI try-on (private.studio_try_on_allowed)", () => {
    expect(tiersAllowed(latestDefinition("private.studio_try_on_allowed"))).toEqual(fromTier(lowestPlanWith("tryOn")));
  });

  it("the own logo on posts (private.studio_share_logo_allowed)", () => {
    expect(tiersAllowed(latestDefinition("private.studio_share_logo_allowed"))).toEqual(fromTier(lowestPlanWith("ownLogo")));
  });

  it("templates and folders (private.studio_artist_plan)", () => {
    const allowed = tiersAllowed(latestDefinition("private.studio_artist_plan"));
    expect(allowed).toEqual(fromTier(lowestPlanWith("templates")));
    expect(allowed).toEqual(fromTier(lowestPlanWith("collections")));
  });

  it("templates and folder writes go through that check, not plain Studio access", () => {
    expect(latestDefinition("public.studio_templates")).toMatch(/not private\.studio_artist_plan\(\)/);
    expect(latestDefinition("public.studio_use_template")).toMatch(/not private\.studio_artist_plan\(\)/);
    const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
    const sql = files.map((f) => readFileSync(join(MIGRATIONS, f), "utf8")).join("\n");
    for (const policy of [
      "studio_collections: owners on the Artist plan insert",
      "studio_collections: owners on the Artist plan update",
      "studio_collection_creations: owners on the Artist plan add their own creations",
    ]) {
      expect(sql).toContain(`create policy "${policy}"`);
    }
    for (const old of [
      "studio_collections: owners with Studio access insert",
      "studio_collections: owners with Studio access update",
      "studio_collection_creations: owners with Studio access add their own creations",
    ]) {
      expect(sql).toContain(`drop policy "${old}"`);
    }
  });
});
