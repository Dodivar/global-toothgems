# Studio try-on — change log (decision 111)

Changes to the AI try-on ("Try it on my smile") made after the owner's test
renders, with what each one is meant to fix and how to take it back if the
renders do not improve. Each line is one commit on `dev`; reverting it is
`git revert <commit>` on `dev`, then redeploying what it touched (the Edge
Function `studio-try-on` from `supabase/functions/`, the site from Vercel).

The function must be deployed from an up-to-date `dev` checkout: on
2026-10-28 a deployment at 08:41 UTC carried the code from before
`45ac71f` (a checkout that had not pulled `dev`), so none of the changes
below were running during the 08:41–08:57 tests.

| Date | Commit | What | Why | Touches |
| --- | --- | --- | --- | --- |
| 2026-10-28 | `45ac71f` | The browser lines the AI's mouth close-up up with the photo before pasting it (`webapp/src/lib/studio3d/tryOnAlign.ts`); the AI also gets a wider 3D view of the whole smile (IMAGE 4, with the map); the function logs `render size` (size sent, proportions asked, size received, proportions refused). | The smile sometimes came back too large: the model had zoomed into its answer, which was stretched onto the crop. | site + function |
| 2026-10-28 | `fdd969d` | Gems whose spot does not show on the photo are left out of the render (marked LEFT OUT in the design data), the result says how many; a design with no visible gem is refused (`design_hidden`). | Lower gems were drawn on the lip where the lower teeth were hidden. | site + function |
| 2026-10-28 | `00e5701` | The photo is read twice and the strictest reading decides; the scale sent to the image model is measured on the mouth close-up; a scale is sent only when the incisors' box is coherent with the teeth's; the gem spots are judged on the close-up. | A photo too far away was refused by one reading and accepted by the next (span 0.22 vs 0.33), and the whole-face reading had the front teeth 1.7 times too wide, so the gems came out oversized and spread onto the gum and the lip. | function |

## What to look at in the function logs

- `photo check`: `spans` (one per reading), `pose`, `issues`, `mm`, `mm_incoherent`.
- `close-up check`: `mm` (close-up scale), `mm_from_photo`, `scale_sent`, `spots`, `left_out`.
- `render size`: `sent`, `asked`, `received`, `ratio_dropped`.
