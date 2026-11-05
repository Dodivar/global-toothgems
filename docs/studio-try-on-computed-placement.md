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
tightly, the darkest gap may be elsewhere. It first shipped measured only, behind a flag; since the trial with it applied
(below) it is on for every customer, without a flag, and `studio_try_on_placement` carries what it found and
corrected (`arbiter_*`). A risk kept in view: a photo the phone saved mirrored (some front cameras do), whose
teeth the model named rightly, has its 2x on the image's left — today refused (`out_of_order`), it would be named
back as "mirrored" and its gems put on the wrong side; the pixels cannot tell it from a misnamed reading. Watch for it in `arbiter_corrections`
(`mirrored`).

**The teeth rebuilt from the gaps** (`segmentTeeth`, same module, same flag; 2026-11-05). Comparing the model's
boxes with the gaps showed where most wrong-tooth gems come from: the teeth model draws its boxes on a near-even grid
(about 0.7 central incisor widths a tooth) — the central incisors too narrow, the lateral ones over their outer part,
the lower incisors about 0.5 wide instead of 0.64 — while the gaps, from photo to photo, put the upper teeth's outer
edges at 1.05, 1.73 and 2.32 central widths from the midline and the lower ones' at 0.64, 1.28 and 1.88
(`UPPER_EDGES`, `LOWER_EDGES`). So, once the midline gap stands out and agrees with the reading (within 0.6 central
widths, less than a tooth; or after the corrections above): the central incisors' outer edges are taken as the
innermost strong pair of gaps alike on both sides (within 15 %), which gives the photo's scale; from there each side
is walked outward, each tooth ending on the gap nearest where a tooth of the usual width ends (within 30 % of its
width), stopping at the first tooth without one; the lower arch the same from its own midline gap (the strong gap
nearest the upper midline, within 0.45). Each rebuilt box keeps the model's top and height for that tooth (or its
mirror's); a box the model drew inside a rebuilt one, for another tooth, is dropped.

Replayed on the 30 analyses of the trial, with one gem on each tooth 13 to 23 and 43 to 33, scored against the tooth
limits measured from the gaps: upper gems right 90 → 143, wrong 13 → 6; lower gems right 68 → 133, wrong 7 → 0;
left out 50 → 24; placements refused 11 → 4; renders with a wrong gem 13 → 6 — the 6 wrong gems left sit on the
limit between two teeth (2.24 for a limit at 2.24, 1.79 for 1.79). Caution, beyond the one above: the tooth limits
the replay scores against come from the same gaps, so the lower figures are consistency with the gaps, not a
measured gain — the rebuilt boxes and the gems drawn over 4 photos (P2, P4, P6, P7) were checked by eye: each
on its tooth, the lower central incisors under the right gap; the edges' proportions were measured on these photos;
rebuilding readings that agree (and `AGREE` at 0.6, not 0.35) was set to fix one photo (P6, both readings 0.4 off);
the vertical place of the gems (the boxes' tops and heights) is still the model's; one photo (P5) stays refused, too
dark for its gaps.

Check of 2026-11-05 (P4-S1, P6-S1, P7-S1, measured only): the browser's pixel midline and rebuilt teeth gave
exactly the replay's values on the three photos (offsets, teeth rebuilt per arch), and its placement would have been
reliable on all three, P7's included (refused today) — so the replay stands for the browser.

**The gems moved back onto their marks** (`tryOnGemBlend.ts`, 2026-11-05; first behind a flag, on for every customer
since the trial with it). The renders showed the placement right but the gems drawn by the image model
larger (hearts 1.3 to 1.8 times) or beside their marks, and the paste-back kept them as drawn. Now a gem
drawn more than `RESEAT_DRIFT` (half a gem) off its mark or `RESEAT_SIZE` (1.3) times its size or more is read where it was drawn
(its centre refined on its own changes: a neighbour's halo or a redrawn tooth edge pulled the plain centre aside),
scaled to `RESEAT_TARGET` (1.1, the measure taking in the gem's sparkle) and laid on its mark: its body whole, its
rim only where the model changed the photo — not the tooth around it, whose shrunk copy left square seams; a drawing
that is not a dense patch of change (a pale crystal on a pale tooth) is kept as drawn. Replayed offline on six renders
of the trial (the photo, the model's answer — already lined up, `tryOnAlign` found nothing to move — and the marks
read back from the guide image, not the production marks: read with too high a threshold they came out split or
missing on pale marks, which first showed as artefacts), each final image measured like an answer: the 24 gems moved
back went from a median size of 1.39 times their mark to 1.05 (17 over 1.3 → 2; 3 left under 0.9) and from a
median drift of 0.78 half-sizes to 0.1 (16 over half a gem → 0); the gems not moved stayed as they were; by eye,
the hearts, navettes, drops and charms are back at the design's size and place, without seams. Tried and dropped: a
version that moved the whole disc (square seams of shrunk tooth), one without the density check and with a smaller
body (pale crystals broken or shrunk to 0.8), and moving gems drawn under half a gem off.

**The colour match on the tooth only** (`tryOnGemBlend.ts`, 2026-11-05, for every customer). Each gem pasted
from the answer has its colours matched to the photo by the answer's offset on a ring just outside its disc. On a
heart of small crystals set close together, that ring fell on the neighbouring gems, so the offset was the gems'
(red, grey facets), and taking it off lightened the tooth around every gem into a lemon-yellow patch (the photo's red
already at 255, only green and blue rose). The ring now reads the tooth only — outside every gem's disc, without
the pixels the model changed like a gem — widened until it has 24 of them, with the median per channel.

**Trial with both flags on** (2026-11-05 11:49, `TRIAL_ARBITER=1`, the same 7 photos × 5 creations as the
10:44 trial with the arbiter measured only): results 19 → 26, placements too uncertain 11 → 4 (P7 now all five,
P5 one of five), photo refused unchanged (P1). By eye on the sheets, the gems of P2, P3, P4, P6 and P7 are on
their teeth, P2's on the right teeth although the teeth model named them a whole tooth off one way (S1) and the
other (S4) — the arbiter shifted both back. In the browser, `reseat` moved back 71 gems in 26 renders, no
seam visible on the sheets; the hearts and charms are at the design's size. Replayed offline, the browser's arbitration matched on all 30
analyses, and two misses showed:
- P6-S5: both readings 0.34 and 0.45 to the left (they agree), and the midline gap (34) hardly stronger than the
  central incisors' outer edges (32, 29), so none stood out within `SEARCH` and nothing was corrected — the 21's
  gem sat on the midline. Readings that agree now take the gap within `AGREE` of them that stands out there, when
  at least `AGREE_STRENGTH` (0.75) as strong as the strongest within `SEARCH`.
- P5 (S1, S4, S5): renamed a whole tooth off and right, but the central incisors' outer edges (0.16 and 0.26 of
  the midline's strength) were under `SEGMENT_STRENGTH` (0.2), so the boxes were only snapped (the 11 then 0.71
  wide) and the fit missed the gap (0.358 > 0.3): refused. An edge of that pair may now be down to
  `PAIR_EDGE_STRENGTH` (0.12) when the pair together is as strong as two edges at `SEGMENT_STRENGTH`.
Replayed on the 60 analyses of both trials, these two changes alter only P3 (its boxes now rebuilt, on the gaps;
its readings were right), P5 (11 to 23 rebuilt, 11 at 1.06 wide) and P6-S5 (midline on the gap); every other
analysis is unchanged. Not yet checked in the browser: P5's fit on the rebuilt teeth (whether it now passes 0.3).

Still open after this trial: the message for gems left out says they are hidden by a lip or other teeth even when
the teeth were not found (separate the two); the image model drew 18 % of the gems more than half a gem off their
mark and 20 % more than 30 % larger or smaller (worst on hearts and navettes) — see `reseat` above.

Known limits: the teeth model sometimes numbers the teeth one tooth off (seen on one trial photo: the whole design
then moves one tooth, with a high confidence, since the fit stays consistent; since 2026-11-04 the renumbering above
catches a whole arch off by one, a single misnamed tooth is still only set aside); a mirrored selfie puts the person's
left teeth on the image's left; lower teeth are often partly hidden by the upper ones.
