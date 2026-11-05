# Studio try-on trial (computed placement)

Evaluation harness for decision 111 (k) (`docs/studio-try-on-computed-placement.md`): it drives the **real**
try-on dialog of the local site, connected to the real Supabase project, for every photo × test creation —
sign in, open the creation, add the photo, tick the consent, "Generate the AI render". Every step goes through
the deployed Edge Function `studio-try-on` exactly as a member's browser does (analysis, placement and guide in
the browser, Nano Banana render, paste-back).

Run it on a machine with a GPU: the browser draws the creation in 3D before each render, which takes seconds
with a GPU and minutes in a container without one.

## Prerequisites

- `webapp/.env.local` pointing at the project (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`).
- `npm install` in `webapp/`, then the browser once: `npx playwright install chromium`.
- The test staff account (active `admin`, so no daily limit) and its five creations "Essai 1 … Essai 5" in
  My Creations, found by the start of their name ("Essai 1 —" … "Essai 5 —"; what follows the dash can change).
  The script checks they are all there before the first run, else lists the creations it sees and stops. Its e-mail and password are given to the person running
  the trial, never committed.
- A folder with the smile photos: every photo in it (`.jpg`, `.jpeg`, `.png`, `.webp`, `.heic`) is used, sorted by
  name, up to 20 (P1…P20); beyond 20 the script warns and keeps the first 20.

## Test creations (since 2026-11-05)

Made to probe the limits of the computed placement, on both arches (54 pieces, 31 of them on the lower teeth):

| | Creation | What it tests |
| --- | --- | --- |
| S1 | Deux lignes — 12 rounds, 13 to 23 and 43 to 33 | registration of both arches, one gem per tooth |
| S2 | Symétrie haut et bas — 5 mirror pairs | left/right symmetry on both arches, rotated navettes (330° / 30°) on 42/32 |
| S3 | Grappes denses — 21 above, 41 and 31 below | small SS5 stones close together on a large and on narrow lower incisors |
| S4 | Zones difficiles — premolars, gum lines, edges | gems often hidden (14/24/44/34, the lower gum line), incisal edges, smallest piece (baguette 1.5×2 mm at 90°) |
| S5 | Formes, matières et rotations — upper and lower | gold and silver charms, a dark stone (black diamond), rotations, an elongated 2×5 mm baguette, mostly on the lower arch |

## Run

Terminal 1 (from `webapp/`): `npm run dev` — the site on http://localhost:5173, an origin the function allows.

Terminal 2 (from `webapp/`), PowerShell:

```powershell
$env:TRIAL_EMAIL = "<test account e-mail>"
$env:TRIAL_PASSWORD = "<test account password>"
node scripts/try-on-trial/run.mjs --photos "C:\path\to\photos" --out try-on-trial-results
```

bash: `TRIAL_EMAIL=… TRIAL_PASSWORD=… node scripts/try-on-trial/run.mjs --photos ~/photos --out try-on-trial-results`

The report's "Pixel midline" column says what the pixel midline (`src/lib/studio3d/tryOnMidline.ts`) found and
corrected; "Moved back" counts the gems the AI drew beside their marks or too large, moved back onto them at their
size (`tryOnGemBlend.ts`). Both run as for every customer.

Options: `--only P3:S1,P12:S2` (some pairs only), `--skip-done` (resume: skips pairs with a result or whose photo
the check refused), `--pause 45` (seconds between runs, default 45: back-to-back renders hit the image model's
per-minute quota, HTTP 429) — the pause follows a run that reached the image model only, none otherwise; a photo the check refuses twice
in a row (the function's 422) is not tried on its remaining creations (recorded as refused; the other photos go on) — a placement
too uncertain is not a refusal of the photo (it depends on the creation) and does not count, `--headed` (watch the browser). A failed render or a closed browser is retried once
(the browser relaunched and signed in again). Each photo means 5 runs: 20 photos are 100 runs, about 2 to 2½ hours with
the default pause; each counts as a render (the staff account has no daily limit) and is billed by the image model.

## Output (`--out`, not committed: it holds the photos' renders)

- `P<n>-S<m>/`: `log.json` (calls, timings, errors; `placement` and `result`: the facts of the Studio's
  `studio_try_on_placement` and `studio_try_on_result` events — confidence, issues, midline error, renumbering, gems
  placed and left out; gems the image model drew, moved or resized), `analysis.json` (teeth
  found and the close-up), `guide.jpg` (the marks sent to the model), `answer.*` (the model's close-up),
  `result.jpg` (pasted back), `dialog.png`.
- `sheet-P1.jpg` … `sheet-P20.jpg`: one contact sheet per photo — guide beside result close-up for each creation.
- `summary.json`: one line per run (outcome, teeth found on each arch, notes such as gems left out).
- `report.md`: the trial in figures — outcomes (photo refused by the check apart from placement too uncertain), per
  creation, placement and render per run, per photo (teeth found upper / lower, first error). No photo in it: it can be
  sent as is, with the sheets, for the analysis.

A run's folder is emptied of the previous run's files before it runs, so a folder never mixes two runs (the trial of
2026-11-05 had guides and results of 2026-11-01 beside newer logs).

`--report-only` rebuilds `summary.json`, `report.md` and the sheets from the results already in `--out`, without
any run (no account needed). Only one trial can write to an `--out` folder at a time: a second one stops at once
(two in parallel share the image model's per-minute quota and fail with HTTP 429).

Send `report.md` and the sheets back for the report. The photos and results are personal data: keep them
out of the repository and delete them once the trial is analysed.
