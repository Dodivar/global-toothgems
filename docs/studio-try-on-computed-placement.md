# Studio try-on: computed gem placement

Decision 111 (k) in `supabase/README.md`. Owner's request (2026-11-01): the gems' places on the customer's photo must
be predictable; the image model (Nano Banana) only makes the result realistic. The current behaviour (the model
places the gems from the design images and text) stays available and is tagged `try-on-ai-placement`.

Owner's decisions (2026-11-01): **physical gem size** (real millimetres × the photo's fitted scale); evaluated
for staff first, then, after the trial (`webapp/scripts/try-on-trial/`), **the only try-on for everyone** — the
former behaviour and the staff tools (diagnostic, compare, drift check) removed the same day.

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

Done (2026-11-01). The try-on is: analysis (function) → placement and guide (browser) → render ("v4" prompt) →
paste-back. An unreliable placement asks for another photo (decision to confirm). The former behaviour is the code
of commit `7ba69d1`.

Tunable values to revisit with real photos: `RELIABLE_CONFIDENCE` (0.6), `OUTLIER_RESIDUAL` (0.5 of a tooth's
width), the confidence weights in `registerDesign`, `TRY_ON_TEETH_MODEL` (a stronger model if teeth are misnumbered).

Fixes after the owner's trial of 2026-11-03 ("Test 3": drops on the lower incisors drawn on the lower lip, stars
and hearts 1–2 mm off): a lower tooth whose box starts at the upper teeth's edge is taken as covered by them and its
biting edge is put `LOWER_OVERBITE_MM` (2 mm) above its box; a gem whose centre falls outside its tooth's visible box
is `hidden` (left out and counted, never drawn on a lip or a gum). Replaying the registration on that photo (tooth
boxes measured by hand) put every gem within the visible teeth; the rest of the gap seen on the render (hearts drawn
~40 % larger than their marks, stars ~1.5 mm off) comes from the image model not keeping the marks exactly — not
measured on the real boxes, since neither the photo nor the model's answers are stored.

Improvements of 2026-11-04 (owner's go-ahead on the review of the placement; no manual adjustment of the gems,
owner's decision):

1. **The lower arch has its own vertical offset** (`lowerOffset`, `fitArches`): the reference has its teeth closed,
   a smiling mouth is often open. Replayed on a synthetic smile, from a 6 mm opening every lower tooth was set aside
   as disagreeing and its gems left out, while the placement still read as reliable; the offset is now fitted with
   the similarity (within `LOWER_OFFSET_RANGE`, −4 to 20 mm) and the lower teeth stay.
2. **The teeth's numbers are questioned**: each arch is also fitted one tooth to either side (`shiftNumbering`), and
   a numbering is replaced only when clearly better (`RENUMBER_MARGIN`, `RENUMBER_RATIO`) on the teeth's places and
   widths (a central incisor named lateral is too wide). The photo check's `central_incisors_box`, asked for since
   2026-10-26 but unused, now goes with the analysis (`centrals`, in the close-up's pixels; function change) and
   serves as a tie-breaker (`MIDLINE_WEIGHT`) and a check: a midline farther than `MIDLINE_TOLERANCE` (half a central
   incisor) is the `midline_mismatch` issue and lowers the confidence. On synthetic smiles with uneven teeth (±15 %),
   a one-tooth shift was corrected every time and correct numbers were never changed — to confirm on real photos.
3. **Analytics** (`tryOnAnalytics.ts`, events `studio_try_on_photo_refused`, `studio_try_on_placement`,
   `studio_try_on_result` in `docs/studio-trial-analytics.md`): facts only, to tune the values above on real use.
4. **Only the gems are taken from the AI's answer** (`tryOnGemBlend.ts`, `pasteBack.ts`): around each mark, a soft
   disc a little larger than the gem, its colours matched to the photo on a ring outside; the rest of the photo stays
   the customer's, so the model can no longer change the teeth or the lips or add a gem away from the marks. A gem
   drawn beside its mark is kept whole where it was drawn. Each gem is measured (drawn or not, drift, size) for the
   analytics. When the answer differs from the photo everywhere (`MAX_BACKGROUND`), it is pasted whole as before.

Review of the trial of 2026-11-05 (the former five test creations — the lower-arch ones of `c36f487` were not run
yet — on 6 photos; 22 runs with an analysis, 4 of whose photos could be scored). Method: the real midline and
central incisor width measured by hand on each photo; the stored analyses replayed through `registerDesign` with one
gem on each upper tooth 13 to 23; a gem's tooth read from its distance to the midline (tooth limits approximated from
the central incisor's width: 1, 1.75 and 2.45 widths). Findings:

- **32 of 120 gems (27 %) landed on a neighbouring tooth**, all in placements read as reliable; per photo 7 % to 38 %.
- The cause is the teeth model, not the fit: on the same photo the boxes moved by half a tooth to a whole tooth from
  one analysis to the next (the upper arch named a tooth off on one analysis of a photo; an upper lateral incisor
  named 11 with the real 11 missing on another), and on one photo most analyses drew 11 half a tooth off.
- The midline check was skipped on 8 of the 22 analyses: the check model draws the central incisors' box 1.1 to 1.8
  times too wide, past the former bound (1.6); among them the two analyses with a tooth-off upper arch. When run, a
  mismatch only lowered the confidence, which stayed above `RELIABLE_CONFIDENCE`.

Changes:

1. **The midline check always runs** (`MAX_CENTRALS_SPAN` 1.6 → 2.5) **and a mismatch makes the placement uncertain**.
   Replayed: wrong-tooth gems 32 → 25; one analysis more is uncertain (its 6 gems: 5 wrong, 1 right); on another, a
   renumbering now puts two gems right and one wrong. To confirm on the next trial.
2. **Readings of the teeth merged** (`TRY_ON_TEETH_READINGS`, 1 by default — no change until set; `mergeTeeth`: a
   reading whose midline disagrees is left out, then each tooth's box is the median of the readings that found it;
   the analysis answers `teeth_readings` { asked, answered, kept }). Simulated by merging three analyses of different
   runs of a photo (different crops, all at temperature 0; the function reads the same close-up, the extra readings
   at 0.6): with change 1, per photo 17 → 20 %, 7 → 0 %, 29 → 35 %, 22 → 21 % — even on average, hence off by
   default: to measure on a trial (two more text model calls per analysis when set to 3).
3. **The trial records the placement and the render** (`log.json` `placement` / `result`, a table in `report.md`)
   from a copy of the Studio's analytics events dispatched on the page only when the trial flags it
   (`STUDIO_EVENT_DOM`, `window.__gtTrial`); tells a placement too uncertain from a photo refused by the check (only
   the latter skips the photo's other creations, no pause after either); empties a run's folder first (stale guides
   and results of 2026-11-01 sat beside newer logs); records each creation's real title and warns when it is not
   the one described.

Tried and left out: renaming one half of an arch (a tooth missed beside the midline) on top of the whole-arch shift:
on the replay it fixed one analysis and broke another.

Still open: the wrong-tooth gems left come mostly from one photo where nearly every reading draws 11 half a tooth
off — a systematic error of the teeth model; `TRY_ON_TEETH_MODEL` (a stronger model) is the next thing to try. The
message of an uncertain placement ("les dents ne ressortent pas assez nettement…") blames sharpness, which is no
longer the usual reason; its wording is the owner's call. When the photo-check reading kept has no teeth box, the
whole photo is analysed (seen once).

Review of the second trial of 2026-11-05 (the five lower-arch creations of `c36f487`, 7 photos, 35 runs, the
midline check above live): 19 renders, 5 photos refused by the check (one photo shot from below, rightly), 11
placements uncertain. Scored as above (one gem on each upper tooth 13 to 23; the midlines measured again on a 2×
zoom: two of the first review's were off, P5 760 px not 728, P6 817 px not 797, so its per-photo figures are
approximate):

- **5 of the 11 uncertain placements were right and refused** (one photo, all five creations): the teeth were
  named correctly (11/21 within 0.04 central incisor widths of the real midline) and the photo check's box was 0.6
  off. The other 6 were rightly refused: the whole upper arch named a tooth off (5), named mirrored (1).
- Of the 19 renders, 15 of 112 upper gems (13 %) on a neighbouring tooth, in 9 renders: an upper lateral incisor
  named 11 with the real 11 missed (4 analyses of one photo), the upper boxes squeezed toward one side (5 renders of
  another photo).
- The lower arch is not scored (no lower midline measured); on one photo its boxes covered half the arch, a tooth
  or more off, 14 of 20 teeth were set aside and its gems left out with the message that they are hidden by a lip.

**The pixel midline** (`tryOnMidline.ts`, `components/studio/tryOn/midlineArbiter.ts`; behind a flag, off by
default): a third source for the midline, from the photo itself — the dark gaps between the upper teeth along the
central incisors' crowns. On the 11 distinct analyses of the trial, the darkest gap near the two readings was the
real midline every time (within 0.03 central incisor widths). It is used only when the readings disagree (midlines
more than 0.25 widths apart, no check box, 11 and 21 not touching, or a mirrored naming) and only when one gap
stands out (1.3 times the next one near the readings); then the reading is named back if mirrored, renamed a tooth
along the arch (its midline 0.65 to 1.4 widths off the gap) or on one side only (11 and 21 more than 0.4 widths
apart), its upper boxes' edges moved onto the gaps near them, and the check box replaced by one centred on the gap.
A renamed reading is used only if its fitted midline lands within `CORRECTED_MIDLINE_TOLERANCE` (0.3) of the gap.

Replayed on the 30 analyses of the trial (the module on the photos' pixels): placements refused 11 → 5, upper gems
right 97 → 137, wrong 15 → 13, renders with a wrong gem 9 → 8. Caution: the values were set on these same photos,
of one or two people with a marked gap between the central incisors; on someone whose central incisors touch
tightly, the darkest gap may be elsewhere. So it ships measured only: `studio_try_on_placement` carries what it
found and whether its placement would have been reliable (`arbiter_*`), the trial applies it with
`TRIAL_ARBITER=1`; it is turned on for customers with `NEXT_PUBLIC_TRY_ON_MIDLINE_ARBITER=on` once checked on
photos of other people. A risk to weigh before: a photo the phone saved mirrored (some front cameras do), whose
teeth the model named rightly, has its 2x on the image's left — today refused (`out_of_order`), it would be named
back as "mirrored" and its gems put on the wrong side; the pixels cannot tell it from a misnamed reading.

Still open after this trial: the message for gems left out says they are hidden by a lip or other teeth even when
the teeth were not found (separate the two); the image model drew 18 % of the gems more than half a gem off their
mark and 20 % more than 30 % larger or smaller (worst on hearts and navettes), and the paste-back keeps a drifted gem
where it was drawn.

Known limits: the teeth model sometimes numbers the teeth one tooth off (seen on one trial photo: the whole design
then moves one tooth, with a high confidence, since the fit stays consistent; since 2026-11-04 the renumbering above
catches a whole arch off by one, a single misnamed tooth is still only set aside); a mirrored selfie puts the person's
left teeth on the image's left; lower teeth are often partly hidden by the upper ones.
