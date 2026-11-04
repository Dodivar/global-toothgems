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

## Test creations (since 2026-11-04)

Made to probe the limits of the computed placement, not just its centre case (44 pieces in all):

| | Creation | What it tests |
| --- | --- | --- |
| S1 | Ligne du sourire — 6 SS7 rounds, 13 to 23 | registration across the whole front arch, one gem per tooth |
| S2 | Symétrie — 3 mirror pairs 11/21, 12/22, 13/23 | left/right symmetry, rotated navettes (330° / 30°) |
| S3 | Grappe dense — 10 gems on 11 and 21 | small SS5 stones close together and by the midline, mixed sizes |
| S4 | Zones difficiles — premolars, gum line, incisal edge, lower arch | gems often hidden (14/24/15, lower 41/31/33), smallest piece (baguette 1.5×2 mm at 90°) |
| S5 | Formes, matières et rotations — 10 pieces | gold and silver charms, dark stones (black diamond), rotations, an elongated 2×5 mm baguette |

## Run

Terminal 1 (from `webapp/`): `npm run dev` — the site on http://localhost:5173, an origin the function allows.

Terminal 2 (from `webapp/`), PowerShell:

```powershell
$env:TRIAL_EMAIL = "<test account e-mail>"
$env:TRIAL_PASSWORD = "<test account password>"
node scripts/try-on-trial/run.mjs --photos "C:\path\to\photos" --out try-on-trial-results
```

bash: `TRIAL_EMAIL=… TRIAL_PASSWORD=… node scripts/try-on-trial/run.mjs --photos ~/photos --out try-on-trial-results`

Options: `--only P3:S1,P12:S2` (some pairs only), `--skip-done` (resume: skips pairs with a result or whose photo
the check refused), `--pause 45` (seconds between runs, default 45: back-to-back renders hit the image model's
per-minute quota, HTTP 429), `--headed` (watch the browser). A failed render or a closed browser is retried once
(the browser relaunched and signed in again). Each photo means 5 runs: 20 photos are 100 runs, about 2 to 2½ hours with
the default pause; each counts as a render (the staff account has no daily limit) and is billed by the image model.

## Output (`--out`, not committed: it holds the photos' renders)

- `P<n>-S<m>/`: `log.json` (calls, timings, errors), `analysis.json` (teeth
  found and the close-up), `guide.jpg` (the marks sent to the model), `answer.*` (the model's close-up),
  `result.jpg` (pasted back), `dialog.png`.
- `sheet-P1.jpg` … `sheet-P20.jpg`: one contact sheet per photo — guide beside result close-up for each creation.
- `summary.json`: one line per run.

Send `summary.json` and the sheets back for the report. The photos and results are personal data: keep them
out of the repository and delete them once the trial is analysed.
