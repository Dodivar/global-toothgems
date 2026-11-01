# Studio try-on trial (computed placement)

Evaluation harness for decision 111 (k) (`docs/studio-try-on-computed-placement.md`): it drives the **real**
try-on dialog of the local site, connected to the real Supabase project, for every photo × test creation, with
"Render with computed placement" — sign in, open the creation, add the photo, tick the consent, render. Every
step goes through the deployed Edge Function `studio-try-on` exactly as a staff member's browser does
(analysis, registration and guide in the browser, Nano Banana render, paste-back, drift check).

Run it on a machine with a GPU: the browser draws the creation in 3D before each render, which takes seconds
with a GPU and minutes in a container without one.

## Prerequisites

- `webapp/.env.local` pointing at the project (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`).
- `npm install` in `webapp/`, then the browser once: `npx playwright install chromium`.
- The test staff account (active `admin`, so no daily limit) and its five creations "Essai 1 … Essai 5" in
  My Creations. Its e-mail and password are given to the person running the trial, never committed.
- A folder with the smile photos (the first five, sorted by name, become P1…P5).

## Run

Terminal 1 (from `webapp/`): `npm run dev` — the site on http://localhost:5173, an origin the function allows.

Terminal 2 (from `webapp/`), PowerShell:

```powershell
$env:TRIAL_EMAIL = "<test account e-mail>"
$env:TRIAL_PASSWORD = "<test account password>"
node scripts/try-on-trial/run.mjs --photos "C:\path\to\photos" --out try-on-trial-results
```

bash: `TRIAL_EMAIL=… TRIAL_PASSWORD=… node scripts/try-on-trial/run.mjs --photos ~/photos --out try-on-trial-results`

Options: `--only P3:S1,P5:S2` (some pairs only), `--skip-done` (resume: skips pairs with a result or whose photo
the check refused), `--pause 45` (seconds between runs, default 45: back-to-back renders hit the image model's
per-minute quota, HTTP 429), `--headed` (watch the browser). A failed render or a closed browser is retried once
(the browser relaunched and signed in again). 25 runs take about 30–40 minutes; each counts as a render (the staff account
has no daily limit) and is billed by the image model.

## Output (`--out`, not committed: it holds the photos' renders)

- `P<n>-S<m>/`: `log.json` (calls, timings, the staff report under the result, errors), `analysis.json` (teeth
  found and the close-up), `guide.jpg` (the marks sent to the model), `answer.*` (the model's close-up),
  `result.jpg` (pasted back), `dialog.png`.
- `sheet-P1.jpg` … `sheet-P5.jpg`: one contact sheet per photo — guide beside result close-up for each creation.
- `summary.json`: one line per run.

Send `summary.json` and the five sheets back for the report. The photos and results are personal data: keep them
out of the repository and delete them once the trial is analysed.
