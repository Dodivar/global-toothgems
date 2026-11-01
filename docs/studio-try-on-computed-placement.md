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
3. **Composition** (browser): each gem rendered from the front by the Studio's 3D engine and drawn on the
   close-up, clipped to its tooth.
4. **Render** (function): a new prompt version receives the close-up with the gems already placed and only
   integrates them (shadows, reflections, light); pasted back with `tryOnAlign.ts` / `tryOnComposite.ts`.
5. **Control and evaluation**: drift check of each gem after the render, a staff "Compare" (both behaviours on the
   same photo), placement figures in the function's logs; the owner then chooses the default and the other path
   is removed.

## Status

| Step | State |
| --- | --- |
| 0. Keep the current behaviour | Done: git tag `try-on-ai-placement`; renders unchanged. The runtime switch (`TRY_ON_PLACEMENT`, `ai` by default) comes with step 4, when there is something to switch to. |
| 1. Teeth found on the close-up | Done (staff diagnostic). `TRY_ON_TEETH_MODEL` picks the model (default: the check model). |
| 2. Registration + diagnostic overlay | Done: "Placement diagnostic" button for staff in the Studio workspace's try-on dialog. |
| 3–5 | Not started. First measure the diagnostic on 20–30 varied photos: if the boxes per tooth are too loose, try a stronger `TRY_ON_TEETH_MODEL` before building step 3. |

Tunable values to revisit with real photos: `RELIABLE_CONFIDENCE` (0.6), `OUTLIER_RESIDUAL` (0.5 of a tooth's
width), the confidence weights in `registerDesign`.

Known limits: a mirrored selfie puts the person's left teeth on the image's left — the FDI numbers the model gives
then follow the image, as the current render does; lower teeth are often partly hidden by the upper ones.
