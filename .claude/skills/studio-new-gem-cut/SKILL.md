---
name: studio-new-gem-cut
description: Add a NEW gem cut (a new outline such as a new crystal shape or gold charm) to the 3D Studio and wire it to the shop's products. Use when the owner says a gem has a shape the Studio cannot draw yet, or asks for a new cut / charm / "objet 3D" in the Studio. Not for a new colour or reference of an existing cut (that is only a `studio_gem_appearances` row in a migration).
---

# Studio: add a new gem cut

Read `AGENTS.md` first (§4 Studio row, §10 database, §13 checks, §14 git). Reply to the owner in French; code, comments, commit messages and docs in English.

## 0. Is a new cut really needed?

The Studio draws a gem as a **look** (`shape`, `material`, `color`, `effect`) on one of the outlines in `STUDIO_SHAPES` (`webapp/src/data/studioEditor.ts`). A gem of an existing cut in a new colour needs **no code**: only a `studio_gem_appearances` row (see `supabase/migrations/20261103184717_studio_xilion_rose_appearances.sql` for the pattern: match by slug, skip if the product is missing or already has a row). Without a row, `fallbackLook` in `webapp/src/lib/studio3d/gemCatalog.ts` already shows the gem from its shop shape and colour family.

Only continue if no existing outline fits. Do not stretch an existing one to fake a cut.

## 1. Gather the inputs (ask the owner, do not invent)

- **Name** of the cut in English. Cut names are the makers' English names in every language, never translated (decision 2026-10-29, `SHAPE_NAMES` in `webapp/src/data/products.ts`). Gold charms (teckel, serpent…) are named by what they are and are translated.
- **Material**: faceted crystal (`crystalCut`) or polished gold charm (`goldCharm`) or wire (`wire`).
- **Reference pictures** (front view at least) and the **real dimensions in mm** (width × length). The outline is traced from the shop photos; proportions are checked against them.
- **Product(s)** that use it (slugs), their colours and sizes (SS only for round stones, millimetres otherwise, decision 107).
- Is it also a **shop cut** (a tile in the shop's shape filter, `GemShape`), or only a Studio outline (charms have no shop cut and are grouped by family)? Both vocabularies are separate: `GemShape` (shop, `data/products.ts`, camel/kebab like `star-flower`) and `StudioShape` (Studio, `data/studioEditor.ts`, like `starflower`). `products.shape` is free text in the database (no CHECK), so a new shop cut needs no migration; `studio_gem_appearances.shape` does have a CHECK (step 3).

## 2. Code checklist (all under `webapp/src` unless stated)

Most of these are `Record<StudioShape, …>` or an exhaustive `switch`, so `npm run typecheck` lists whatever is missing once the union is extended. Still go through the list:

1. `data/studioEditor.ts` — add to the `StudioShape` union **and** `STUDIO_SHAPES`.
2. `lib/studio3d/geometry.ts` — build the outline (a `*_OUTLINE` point list like `DACHSHUND_OUTLINE`, or `crystalCut(new THREE.Shape(...))`) and add the `case` in `buildParts`. The template is normalised afterwards (centred, longest half-side 1, flat back at the origin), so draw in any consistent units.
3. `lib/studio3d/pieceScale.ts` — `SHAPE_HALF_EXTENTS`: the measured half extents (x, y) of the normalised template, longest = 1. Compute them from the geometry, do not guess; `geometry.test.ts` fails if they drift.
4. `lib/studio3d/geometry.test.ts` — add the photo's width / height ratio to `PHOTO_ASPECT`.
5. `lib/studio3d/frontView.ts` — `SHAPE_OUTLINES`: the silhouette on the 16-unit grid (no facets), used by the front view and the PDF placement sheet.
6. `components/studio/editor/pieceGlyphs.tsx` — the editor's glyph on the same 16-unit grid.
7. `i18n/locales/studio.fr.json` and `studio.en.json` — the shape's name next to the other shape names (around `"dachshund"`). Both files, every key.
8. `lib/studio3d/pieceScale.test.ts` — extend if the outline's long axis is not obvious.
9. `../supabase/functions/studio-try-on/gems.ts` — `CUTS`: a short English phrase the try-on prompt uses ("kite (diamond-shaped) cut"). Without it the prompt falls back to "`<shape>` cut". Run `npm run test:functions`; the function must be **redeployed** afterwards (README › Edge Functions › Deploy, only with the owner's go-ahead).

If it is also a **shop cut**:

10. `data/products.ts` — `GemShape`, `GEM_SHAPES`, `SHAPE_NAMES`; `data/products.test.ts` if it lists them.
11. `components/ui/ShapeGlyph.tsx` — `GLYPH_PATHS` (32×32 line drawing: `outline` + `facets`).
12. `lib/studio3d/gemCatalog.ts` — `SHOP_SHAPE_TO_STUDIO`, so a gem of that cut with no drawing row already uses the new outline.
13. `components/admin/ProductForm.tsx` — only if the cut should default to SS sizes like round stones (otherwise it defaults to millimetres).

Reuse existing helpers; do not add a dependency. Keep the geometry cached through `getJewelTemplate` like the others.

## 3. Database (a versioned migration, AGENTS §10)

One migration in `supabase/migrations/` (timestamp version, name matching what is applied):

1. Replace the CHECK on `studio_gem_appearances.shape`: look up the real constraint name first (`select conname from pg_constraint where conrelid = 'public.studio_gem_appearances'::regclass and contype = 'c'`; the inline one from `20261007141456_studio_shop_gems.sql` is normally `studio_gem_appearances_shape_check`), drop it and re-add it with **every** current shape plus the new one. Copy the list from `STUDIO_SHAPES` so the two stay identical.
2. The drawing rows of the products that use the cut: `studio_gem_appearances (product_id, variant_id, shape, material, color, effect)` — one row per product, one more per colour variant with its own tint. Tint measured on the product photo (`product-media`), `effect = 'iridescent'` for AB / Shimmer / Vitrail coatings, `material = 'metal'` for gold charms. Match by slug, skip existing rows, so the migration is a no-op on an empty CI database.
3. Extend `supabase/tests/studio_workspace_validation.sql` (a row with the new shape is accepted, an unknown shape is refused) and run it (`npm run test:db` after `supabase start`, or on the project; it rolls back).
4. Regenerate `webapp/src/lib/supabase/database.types.ts` if the tool reports a change (the column is `string`, so usually none), check the Supabase advisors, document in `supabase/README.md` (migration table row + a decision when the cut carries a rule).

**Order matters.** Designs read back from storage drop a piece whose shape the app does not know (`isStudioShape` / `sanitizeLook`). So the **code ships first**, then the migration is applied, then the products are published. Applying a migration to the project or deploying an Edge Function is outward-facing: do it only when the owner asks, and say what was and was not applied.

## 4. Verify before wiring the products

- `cd webapp && npm run typecheck && npm run lint && npm test` (at least `lib/studio3d` and `data`), then `npm run build` and `npm run test:e2e` if routing or rendering was touched. Report only what was run.
- **Look at the result.** Render the outline in the editor with Chromium (pre-installed Playwright, `chromium.launch()`, software WebGL) or describe how the owner can check it, and compare with the reference photo. Show the owner the silhouette and proportions **before** the migration and the product rows, since a wrong cut is painful once designs are saved with it. Say plainly if you could not render it.
- Check the facets read as a crystal (or the metal as a polished charm) at the real sizes, on a tooth, and that the front view and PDF outline match.

## 5. Documentation and git

- `webapp/README.md` › The editor: the `geometry.ts` row lists the outlines — add the new one.
- `AGENTS.md` §4 Studio row only if the change has lasting consequences; keep it short.
- Commit and push as AGENTS §14 says (clear English subject, work on the branch the session gave you, never `main`). Unrelated files stay out of the commit.

## Decisions to confirm (report to the owner, add to `supabase/README.md` "Review of 2026-11-11" if unresolved)

The cut's public name and its shop-filter position, any size convention (SS vs mm) not given by the owner, and the product photo used to measure each tint.
