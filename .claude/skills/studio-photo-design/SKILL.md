---
name: studio-photo-design
description: Turn a reference photo of tooth gems into a 3D Studio creation (or fix an existing one) that matches it, checked with the editor's own overlap and seating rules before it is saved. Use when the owner sends a photo and asks to "reproduce / recreate this design in the Studio", or reports gems overlapping or misplaced in a creation made from a photo.
---

# Studio: photo → creation

Reply in French. Scripts: `.claude/skills/studio-photo-design/scripts/` (run from there, `node` 22.15+, `three`/`sharp` from `webapp/node_modules`, the worktree's or the main checkout's):

```
node --import ./register.mjs design.ts grid <photo> [--crop x,y,w,h] --out g.png   # labelled pixel grid (zoom with --crop)
node --import ./register.mjs design.ts faces                                         # each tooth's width, height, flat zone (mm)
node --import ./register.mjs design.ts build <spec.json> --catalog <catalog.json> --out <dir> --relax [--email <owner> | --update <uuid>]
node --import ./register.mjs design.ts check <scene.json> --out <dir>                # audit a saved creation
```

`build` places every piece on the default **smile** dentition by ray-casting the app's own crowns (`smileDentition.ts`), tests overlaps with the gems' real outlines and the engine's constants (`engine.ts` `outlinesOverlap`, `seatedAt`), flags pieces spilling off a tooth or sitting on a flank, renders `preview.png` (front, close-up, ¾ left, ¾ right) and `preview-photo.png` (the photo's angle), and writes `report.md`, `scene.json` and `creation.sql`. Examples: `examples/*.spec.json`, `examples/catalog.json`.

## Method — do every step, in order

1. **Read the photo with the grid, never by eye.** Run `grid` on the whole photo, then `--crop` each decorated tooth (zoom ×4). Note the photo's angle (which side the camera is on, tilt) → `photoView` (yaw > 0 = camera on the viewer's right).
2. **Name the motif before any coordinate** (`motif`, required): what it represents (star, heart, scorpion, initials, a cane…), its parts, counts, symmetries and repeats ("5 stones in the star's notches + 5 beyond its tips", "the hook on 23 answers the arm on 22, same pitch"). Every element must serve that reading: if a part is repeated (two arms, two claws), build both the same way; if a line bends, it bends in the design too. Re-read the photo for details you missed (a stone half hidden by a lip, a smaller stone in a gap) and list what you are unsure about.
3. **Identify teeth by anatomy** (central widest, lateral shorter, canine pointed; the midline), FDI numbers, viewer's left = patient's right.
4. **Straighten each tooth**: in `photo.teeth`, give its 4 corners in the photo — biting edge viewer-left, biting edge viewer-right, gum viewer-right, gum viewer-left. When a neighbour hides an edge, put the corner on the **estimated real edge**, not the visible one. Then give gems as `px` (pixels); the script maps them to mm on the face (homography per tooth), which removes perspective and tilt.
5. **Regular parts are built, not traced**: rings, lines and arcs (`arc`, `line`, `mirror`) from the photo's centre, orientation and count, at the sizes actually sold. Photo stones are often smaller than any size in the catalogue: keep the motif's structure (scale the composition, reduce a star) rather than the raw pixels, and say so.
6. **Catalogue**: list candidates (`select p.id, p.name from products p join studio_gem_appearances a on a.product_id = p.id where p.status = 'active'`), then write `catalog.json` for the chosen gems only (`key`, `productId`, `variantId`, `name`, `look` from `studio_gem_appearances` — variant row's colour/material over the product's shape —, `sizes` from active variants' `attributes.ss` / `attributes.mm`, else `ss2/ss5/ss7` for round and `3/4/5 mm` otherwise). Only sizes listed there are accepted.
7. **Build with `--relax` and iterate until 0 errors and 0 warnings.** Errors are what the editor frames in red. A flank warning → `shift` the group toward the face. `--relax` moves pieces by small steps; a move > 0.8 mm is a warning: rethink the layout instead.
8. **Look at the renders critically next to the photo** (`preview-photo.png` at the photo's angle): count stones, compare shapes, spacing, orientation. Fix and rebuild.
9. **Save — never overwrite a creation the owner may have retouched.** Default to a new creation (`--email`). Use `--update` only when the owner asks for that very creation to be replaced, and first check its `updated_at`: if it changed since you wrote it, they edited it — stop and ask. There is no history of `scene_data`: an overwrite cannot be undone. Find the account (`select id from auth.users where email = …`), run `creation.sql` with the Supabase MCP (`execute_sql`) — `--email` inserts, `--update <uuid>` replaces. `element_count` comes back from the trigger; thumbnail and price estimate appear at the first save in the editor. Report the gems to plan (`report.md`), the choices made and the doubts.

## Conventions

- Face coordinates (mm): `x` from the crown's centre line toward the viewer's right, `y` from the biting edge toward the gum (lower teeth too). `rot` in degrees, 0 = long axis vertical, positive = counter-clockwise seen from the front; `"tangent"` follows a line/arc; `towardPx` points the long axis at a photo pixel.
- A design made on another model is re-seated by the editor; this skill writes on `smile` only.
