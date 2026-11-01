# Studio try-on: computed gem placement

Decision 111 (k) in `supabase/README.md`. Owner's request (2026-11-01): the gems' places on the customer's photo must
be predictable; the image model (Nano Banana) only makes the result realistic. The current behaviour (the model
places the gems from the design images and text) stays available and is tagged `try-on-ai-placement`.

Owner's decisions (2026-11-01): **physical gem size** (real millimetres × the photo's fitted scale); the computed
placement is **staff only** while it is evaluated.

## Pipeline

1. **Analyse** (Edge Function `studio-try-on`, `action = "analyse"`): photo check, mouth crop, one box per visible
   tooth with its FDI number (`teeth.ts`).
2. **Registration** (browser, pure, `webapp/src/lib/studio3d/tryOnRegistration.ts`): the reference dentition of
   the front view (`frontView.ts`) fitted onto the found teeth; each gem's centre, size and turn on the close-up;
   a confidence. Unreliable → the render keeps the current behaviour.
3. **Composition** (browser, `tryOnGuide.ts` + `components/studio/tryOn/placementGuide.ts`): each gem drawn as a
   flat mark — its cut outline, colour, a thin dark edge and a white shine — at its computed place, size and turn
   on the close-up the function cut. Only gems on a tooth found on the photo are drawn (a tooth only expected by
   the fit may be hidden by a lip); the others are counted as left out. The 3D render of the design goes with it
   for the gems' material.
4. **Render** (function, `placement = "computed"`, staff only): `TRY_ON_SYSTEM_PROMPT_PLACED` — IMAGE 1 the guide,
   IMAGE 2 the same close-up cut by the function from the photo, IMAGE 3 the design in 3D, then the reference
   pictures; the model only turns each mark into a real gem. No second photo check (the analysis ran it); counted
   as a render. Pasted back with `tryOnAlign.ts` / `tryOnComposite.ts`. An unreliable placement falls back to the
   current render, said under the result.
5. **Control and evaluation**: drift check (`tryOnDrift.ts`: each gem's place must have changed, little change
   elsewhere), shown to staff under the result; "Compare" renders the same photo the other way and shows both
   side by side. The owner then chooses the default and the other path is removed.

## Status

| Step | State |
| --- | --- |
| 0. Keep the current behaviour | Done: tag `try-on-ai-placement` (local only: pushing tags is refused from agent sessions; it names commit `7ba69d1`); members' renders unchanged. No runtime switch yet: the computed placement is staff-only, chosen per render in the dialog; a switch for members comes with the owner's choice of default. |
| 1. Teeth found on the close-up | Done (staff diagnostic). `TRY_ON_TEETH_MODEL` picks the model (default: the check model). |
| 2. Registration + diagnostic overlay | Done: "Placement diagnostic" button for staff in the Studio workspace's try-on dialog. |
| 3. Composition | Done (flat marks on the close-up; the 3D engine's own gem sprites were not needed: the model takes the material from the design render). |
| 4. Render | Done, staff only: "Render with computed placement" next to "Generate" in the try-on dialog. Members keep the current render. |
| 5. Control | Drift check and "Compare" done (staff). To do with the owner: 20–30 varied photos compared both ways, then the choice of the default for members (a switch or the removal of one path). |

Tunable values to revisit with real photos: `RELIABLE_CONFIDENCE` (0.6), `OUTLIER_RESIDUAL` (0.5 of a tooth's
width), the confidence weights in `registerDesign`, and the drift thresholds in `tryOnDrift.ts` (`STRAY_LIMIT` 3 %).

Known limits: a mirrored selfie puts the person's left teeth on the image's left — the FDI numbers the model gives
then follow the image, as the current render does; lower teeth are often partly hidden by the upper ones.
