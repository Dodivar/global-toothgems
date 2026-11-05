// Studio try-on trial (decision 111 (k)): drives the real try-on dialog of the local site, connected to the real
// Supabase project, for every photo (all of the folder's, up to 20) × test creation — exactly as a member would: sign in, open the creation,
// add the photo, tick the consent, "Generate the AI render" (the computed placement, decision 111 (k)).
// See README.md next to this file. Nothing here holds a secret: the test account's password comes from the
// environment. The photos and the results stay on this machine.
//
//   node scripts/try-on-trial/run.mjs --photos <folder of up to 20 photos> [--out <folder>] [--only P3:S1,P12:S2] [--headed]
//
// Env: TRIAL_EMAIL, TRIAL_PASSWORD (the test staff account); TRIAL_SITE (default http://localhost:5173);
// TRIAL_ARBITER=1 applies the pixel midline (src/lib/studio3d/tryOnMidline.ts) instead of only measuring it,
// and moves gems the AI drew beside their marks or too large back onto them (tryOnGemBlend.ts `reseat`).
import { chromium } from "@playwright/test";
import { existsSync, mkdirSync, readdirSync, writeFileSync, readFileSync, unlinkSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const argv = process.argv.slice(2);
const opt = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const PHOTOS = opt("photos");
const OUT = resolve(opt("out", "try-on-trial-results"));
const ONLY = opt("only");
const HEADED = argv.includes("--headed");
// Seconds between runs: back-to-back renders hit the image model's per-minute quota (HTTP 429).
const PAUSE_S = Number(opt("pause", "45"));
const SITE = process.env.TRIAL_SITE || "http://localhost:5173";
const EMAIL = process.env.TRIAL_EMAIL;
const PASSWORD = process.env.TRIAL_PASSWORD;
const ARBITER = process.env.TRIAL_ARBITER === "1";
// --report-only: rebuild summary.json, report.md and the sheets from the results already in --out, without any run.
const REPORT_ONLY = argv.includes("--report-only");
if (!PHOTOS || (!REPORT_ONLY && (!EMAIL || !PASSWORD))) {
  console.error("Usage: TRIAL_EMAIL=… TRIAL_PASSWORD=… node scripts/try-on-trial/run.mjs --photos <folder> [--out <folder>] [--only P1:S1,…] [--skip-done] [--pause 45] [--headed]\n       node scripts/try-on-trial/run.mjs --photos <folder> --out <folder> --report-only");
  process.exit(1);
}

// The five test creations, saved on the test account. They are found in My Creations by the start of their name
// ("Essai 1 —" …), so a creation can be renamed after the dash without breaking the trial.
const SCENES = {
  S1: { name: "Essai 1 — Deux lignes (12 ronds, de 13 à 23 et de 43 à 33)", what: "Two lines: SS7 crystal rounds centred on 13…23, SS5 AB rounds on 43…33 (registration of both arches)" },
  S2: { name: "Essai 2 — Symétrie haut et bas (5 paires miroir)", what: "Mirror pairs: 4 mm red hearts 11/21, 4 mm drops 13/23; lower 3 mm AB hearts 41/31, emerald navettes 42 (330°) / 32 (30°), heliotrope drops 43/33" },
  S3: { name: "Essai 3 — Grappes denses (21 en haut, 41 et 31 en bas)", what: "Dense clusters: 4 mm AB starflower + four SS5 on 21; 3 mm blue rivoli + two SS5 on 31; three SS5 (one sapphire) on 41" },
  S4: { name: "Essai 4 — Zones difficiles (prémolaires, collets, bords)", what: "Hard spots: kites on premolars 14/24/44, SS5 sapphire on 34, gum line of 11/43/33, incisal edges of 21/41/31 (baguette 1.5×2 mm at 90°), SS5 on 32" },
  S5: { name: "Essai 5 — Formes, matières et rotations (haut et bas)", what: "Charms and stones: gold bolt 30° (11), silver halo star (21), silver dachshund 315° (13), blue rivoli (23); lower gold snake 90° (41), gold cherries (31), gold open heart (42), sapphire baguette 2×5 mm (32), black-diamond kite 180° (43), heliotrope drop 135° (33)" },
};
// Every photo of the folder, sorted by name, up to MAX_PHOTOS (P1…P20).
const MAX_PHOTOS = 20;
const allPhotos = readdirSync(PHOTOS)
  .filter((f) => /\.(jpe?g|png|webp|heic)$/i.test(f))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
if (!allPhotos.length) {
  console.error(`No photo (.jpg, .jpeg, .png, .webp, .heic) in ${PHOTOS}.`);
  process.exit(1);
}
if (allPhotos.length > MAX_PHOTOS) console.warn(`${allPhotos.length} photos in ${PHOTOS}: only the first ${MAX_PHOTOS} (by name) are used.`);
const photoFiles = allPhotos.slice(0, MAX_PHOTOS);
const PHOTO_BY_KEY = Object.fromEntries(photoFiles.map((f, i) => [`P${i + 1}`, join(PHOTOS, f)]));
/**
 * The photo check refused the photo itself (the function answered 422): every other creation would be refused the
 * same way. The dialog shows the same title when the placement was too uncertain, which depends on the creation:
 * that one is `isPlacementUncertain` and does not skip the photo.
 */
const refusedByFunction = (log) => log.checkRefused ?? (log.calls ?? []).some((c) => c.response?.status === 422);
const isPhotoRefusal = (log) =>
  log.outcome === "error" && /ne permet pas un bon rendu/.test(log.error ?? "") && (!!log.skipped || refusedByFunction(log));
const isPlacementUncertain = (log) =>
  log.outcome === "error" && /ne permet pas un bon rendu/.test(log.error ?? "") && !log.skipped && !refusedByFunction(log);
/** A run's files, removed before it runs again so a folder never mixes two runs. */
const RUN_FILES = /^(log\.json|analysis\.json|guide\.jpg|answer\.(png|jpg)|result\.jpg|dialog\.png|harness-error\.png)$/;
/** "Essai 3 — …" → "Essai 3 —": what the trial matches a creation by. */
const prefixOf = (scene) => SCENES[scene].name.split("—")[0].trim() + " —";
const escapeRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** The "see details" button of a creation's card in My Creations. */
const detailsButton = (scene) => page.getByRole("button", { name: new RegExp(`^Voir le détail de ${escapeRe(prefixOf(scene))}`) });
const pairs = ONLY
  ? ONLY.split(",").map((x) => x.split(":"))
  : Object.keys(PHOTO_BY_KEY).flatMap((p) => Object.keys(SCENES).map((s) => [p, s]));

/** The parts of a multipart body, by field name. */
function parseMultipart(buf, contentType) {
  const boundary = /boundary=([^;]+)/.exec(contentType ?? "")?.[1];
  if (!boundary || !buf) return {};
  const parts = {};
  const sep = Buffer.from(`--${boundary}`);
  let start = buf.indexOf(sep);
  while (start >= 0) {
    const next = buf.indexOf(sep, start + sep.length);
    if (next < 0) break;
    const chunk = buf.subarray(start + sep.length + 2, next - 2);
    const headEnd = chunk.indexOf("\r\n\r\n");
    const head = chunk.subarray(0, headEnd).toString();
    const name = /name="([^"]+)"/.exec(head)?.[1];
    if (name) parts[name] = { head, data: chunk.subarray(headEnd + 4) };
    start = next;
  }
  return parts;
}

mkdirSync(OUT, { recursive: true });
// One trial at a time per output folder: two at once share the image model's per-minute quota (HTTP 429) and
// write the same folders.
const LOCK = join(OUT, ".running");
if (existsSync(LOCK)) {
  const pid = Number(readFileSync(LOCK, "utf8"));
  let running = false;
  try {
    process.kill(pid, 0);
    running = pid !== process.pid;
  } catch {
    running = false; // a lock left by a run that crashed
  }
  if (running) {
    console.error(`Another trial (process ${pid}) is already writing to ${OUT}: close it first (Ctrl+C in its window).`);
    process.exit(1);
  }
}
writeFileSync(LOCK, String(process.pid));
const unlock = () => {
  try {
    if (existsSync(LOCK) && readFileSync(LOCK, "utf8") === String(process.pid)) unlinkSync(LOCK);
  } catch {
    /* nothing to undo */
  }
};
process.on("exit", unlock);
process.on("SIGINT", () => process.exit(130));
// Behind a proxy (HTTPS_PROXY set), the browser uses it too; local pages stay direct.
const proxy = process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY, bypass: "localhost,127.0.0.1" } } : {};
// The guide (a Blob in a FormData) is not visible to Playwright's request events: the page hands it over itself.
let onGuide = null;
// The Studio's analytics events of the run in progress (placement, result).
let onEvent = null;
let browser = null;
let context = null;
let page = null;

/** A fresh browser, signed in. Called again whenever the browser closed (crash, window closed). */
async function launch() {
  await browser?.close().catch(() => {});
  browser = await chromium.launch({ headless: !HEADED, ...proxy });
  context = await browser.newContext({ locale: "fr-FR", viewport: { width: 1280, height: 1000 } });
  await context.exposeBinding("__trialGuide", (_source, b64) => onGuide?.(b64));
  // The Studio's analytics, copied on window (STUDIO_EVENT_DOM in src/lib/studioAnalytics.ts): the placement and result facts.
  await context.exposeBinding("__trialEvent", (_source, detail) => onEvent?.(detail));
  await context.addInitScript((arbiter) => {
    window.__gtTrial = true; // the Studio copies its analytics events on window only then
    window.__gtTrialArbiter = arbiter; // the pixel midline applied, not only measured (midlineArbiter.ts)
    window.addEventListener("gt-studio-analytics", (e) => window.__trialEvent(e.detail));
  }, ARBITER);
  await context.addInitScript(() => {
    const original = window.fetch;
    window.fetch = function (input, init) {
      const body = init?.body;
      if (body instanceof FormData && body.get("guide") instanceof Blob) {
        body.get("guide").arrayBuffer().then((buf) => {
          const bytes = new Uint8Array(buf);
          let s = "";
          for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
          window.__trialGuide(btoa(s));
        });
      }
      return original.apply(this, arguments);
    };
  });
  page = await context.newPage();
  page.setDefaultTimeout(60_000);
  await signIn();
}

const alive = () => !!browser?.isConnected() && !!page && !page.isClosed();
const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));

async function signIn() {
  // A first `npm run dev` compiles each page on its first visit: generous waits.
  await page.goto(`${SITE}/connexion`, { waitUntil: "domcontentloaded", timeout: 180_000 });
  await page.locator('input[type="email"]').first().fill(EMAIL, { timeout: 180_000 });
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.locator('input[type="password"]').first().press("Enter");
  try {
    await page.waitForURL((u) => !u.pathname.startsWith("/connexion"), { timeout: 180_000 });
  } catch {
    // Say why: the page's own message (wrong password, unconfirmed e-mail…), and a screenshot.
    const shot = join(OUT, "signin-error.png");
    await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
    const messages = (await page.locator('[role="alert"], [aria-live]').allInnerTexts().catch(() => [])).map((t) => t.trim()).filter(Boolean);
    console.error(`Sign-in did not complete for ${EMAIL} on ${SITE}.`);
    console.error(messages.length ? `Page says: ${messages.join(" | ")}` : "No message on the page: check that `npm run dev` runs from webapp/ with .env.local pointing at the project.");
    console.error(`Screenshot: ${shot}`);
    await browser.close();
    process.exit(1);
  }
}

/** One line per step, so a run that stops shows where. */
let runStart = Date.now();
const step = (what) => console.log(`    · ${String(Math.round((Date.now() - runStart) / 1000)).padStart(3)} s  ${what}`);

/** The cookie banner covers the bottom of the page (and the cards under it): refuse the optional cookies once. */
async function dismissCookies() {
  const refuse = page.getByRole("button", { name: /Refuser les non essentiels/i });
  if (await refuse.first().isVisible().catch(() => false)) await refuse.first().click().catch(() => {});
}

/**
 * My Creations, ready for the next run. Already on it (the previous run's dialogs still open): close them with
 * Escape instead of loading the Studio again, which takes several seconds; otherwise, or if a dialog stays, load it.
 */
async function openCreations() {
  if (new URL(page.url()).pathname === "/studio-3d/atelier/mes-creations") {
    const dialogs = page.getByRole("dialog");
    for (let i = 0; i < 4 && (await dialogs.count()) > 0; i++) {
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
    }
    if ((await dialogs.count()) === 0) return;
  }
  await page.goto(`${SITE}/studio-3d/atelier/mes-creations`, { waitUntil: "domcontentloaded", timeout: 180_000 });
  await dismissCookies();
}

/** Before any run: every test creation must be in My Creations, else say which are missing and what is there. */
async function checkCreations() {
  await openCreations();
  const cards = page.getByRole("button", { name: /^Voir le détail de / });
  await cards.first().waitFor({ timeout: 120_000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const seen = (await cards.evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? ""))).map((l) => l.replace(/^Voir le détail de /, ""));
  const missing = Object.keys(SCENES).filter((s) => !seen.some((n) => n.startsWith(prefixOf(s))));
  if (!missing.length) return;
  const shot = join(OUT, "creations-missing.png");
  await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
  console.error(`Missing in My Creations of ${EMAIL}: ${missing.map((s) => `"${prefixOf(s)} …"`).join(", ")}.`);
  console.error(seen.length ? `Creations found:\n${seen.map((n) => `  - ${n}`).join("\n")}` : "No creation found on the page (still loading, or another account).");
  console.error(`Screenshot: ${shot}`);
  await browser.close();
  process.exit(1);
}

async function runOne(photo, scene) {
  const dir = join(OUT, `${photo}-${scene}`);
  mkdirSync(dir, { recursive: true });
  for (const f of readdirSync(dir)) if (RUN_FILES.test(f)) unlinkSync(join(dir, f));
  const log = { photo, photoFile: basename(PHOTO_BY_KEY[photo]), scene, sceneName: SCENES[scene].name, started: new Date().toISOString(), calls: [] };
  onEvent = ({ event, props } = {}) => {
    if (event === "studio_try_on_placement") log.placement = props;
    if (event === "studio_try_on_result") log.result = props;
  };
  const t0 = Date.now();
  const onRequest = (req) => {
    if (!req.url().includes("/functions/v1/studio-try-on") || req.method() !== "POST") return;
    const parts = parseMultipart(req.postDataBuffer(), req.headers()["content-type"]);
    if (!Object.keys(parts).length) return; // the JSON status call
    const fields = Object.fromEntries(Object.entries(parts).filter(([, v]) => !/filename=/.test(v.head)).map(([k, v]) => [k, v.data.toString().slice(0, 300)]));
    if (parts.guide) writeFileSync(join(dir, "guide.jpg"), parts.guide.data);
    log.calls.push({ at: Date.now() - t0, kind: fields.action ?? (fields.placement ? `render:${fields.placement}` : "render:ai"), fields });
  };
  const onResponse = async (res) => {
    if (!res.url().includes("/functions/v1/studio-try-on") || res.request().method() !== "POST") return;
    const call = { at: Date.now() - t0, status: res.status() };
    try {
      const text = await res.text();
      if ((res.headers()["content-type"] ?? "").includes("json")) {
        const body = JSON.parse(text);
        if (body.image?.data) {
          writeFileSync(join(dir, `answer.${body.image.mime_type?.includes("png") ? "png" : "jpg"}`), Buffer.from(body.image.data, "base64"));
          body.image = `<${body.image.mime_type}>`;
        }
        if (body.teeth) writeFileSync(join(dir, "analysis.json"), JSON.stringify(body, null, 1));
        call.body = body;
      } else call.body = text.slice(0, 500); // the progress stream of a fallback render
    } catch (e) {
      call.error = String(e);
    }
    log.calls.push({ response: call });
  };
  onGuide = (b64) => writeFileSync(join(dir, "guide.jpg"), Buffer.from(b64, "base64"));
  page.on("request", onRequest);
  page.on("response", onResponse);
  try {
    runStart = Date.now();
    console.log(`${photo}-${scene}`);
    await openCreations();
    const details = detailsButton(scene);
    await details.first().waitFor({ timeout: 90_000 });
    // The creation's real title: the trial finds it by its prefix only, so an older "Essai N" would run unnoticed.
    log.creationTitle = ((await details.first().getAttribute("aria-label")) ?? (await details.first().innerText())).replace(/^Voir le détail de /, "").trim();
    step(`open "${prefixOf(scene)}"`);
    await details.first().click();
    step("Essayer sur un sourire");
    await page.getByRole("button", { name: "Essayer sur un sourire" }).first().click();
    const dialog = page.getByRole("dialog").filter({ hasText: "Essayer sur un sourire" }).last();
    step(`photo ${basename(PHOTO_BY_KEY[photo])}`);
    await dialog.locator('input[type="file"][accept^="image/jpeg"]').setInputFiles(PHOTO_BY_KEY[photo]);
    await dialog.getByText("La personne photographiée m’a donné son accord", { exact: false }).click();
    const generate = dialog.getByRole("button", { name: "Générer le rendu IA" });
    await generate.waitFor({ timeout: 60_000 });
    await page.waitForFunction((el) => !el.disabled, await generate.elementHandle(), { timeout: 60_000 });
    log.clicked = Date.now() - t0;
    step("Générer le rendu IA");
    await generate.click();
    const img = dialog.locator('img[alt*="essayé sur la photo"]');
    const error = dialog.getByRole("alert");
    await Promise.race([img.first().waitFor({ timeout: 900_000 }), error.first().waitFor({ timeout: 900_000 })]);
    log.ended = Date.now() - t0;
    if (await img.count()) {
      log.outcome = "result";
      const marks = log.calls.find((c) => c.fields?.marks)?.fields.marks;
      log.report = marks ? `${marks} gem(s) placed` : "";
      const b64 = await page.evaluate(async (u) => {
        const buf = new Uint8Array(await (await (await fetch(u)).blob()).arrayBuffer());
        let s = "";
        for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
        return btoa(s);
      }, await img.first().getAttribute("src"));
      writeFileSync(join(dir, "result.jpg"), Buffer.from(b64, "base64"));
      log.notes = (await dialog.locator("p").allInnerTexts()).filter((t) => /gemme|non dessinée|cachée/i.test(t)).slice(0, 3);
    } else {
      log.outcome = "error";
      log.error = (await error.first().innerText()).trim();
    }
    await dialog.screenshot({ path: join(dir, "dialog.png"), timeout: 5_000 }).catch(() => {});
  } catch (e) {
    log.outcome = "harness_error";
    log.error = String(e).slice(0, 600);
    await page.screenshot({ path: join(dir, "harness-error.png") }).catch(() => {});
  } finally {
    onGuide = null;
    onEvent = null;
    page.off("request", onRequest);
    page.off("response", onResponse);
    log.total = Date.now() - t0;
    writeFileSync(join(dir, "log.json"), JSON.stringify(log, null, 1));
    const first = log.report || log.error?.split("\n")[0] || "";
    console.log(`${photo}-${scene}  ${log.outcome}  ${Math.round(log.total / 1000)}s  ${first}`);
  }
  return log;
}

/** A run already settled: a result, or a photo the check refused (running it again changes nothing). */
function settled(photo, scene) {
  const file = join(OUT, `${photo}-${scene}`, "log.json");
  if (!existsSync(file)) return false;
  const log = JSON.parse(readFileSync(file, "utf8"));
  return log.outcome === "result" || isPhotoRefusal(log);
}

/** One contact sheet per photo: each creation's guide (computed marks) beside its result close-up, with the figures. */
async function contactSheets() {
  const esc = (s) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
  const summary = [];
  for (const photo of Object.keys(PHOTO_BY_KEY)) {
    const rows = [];
    for (const scene of Object.keys(SCENES)) {
      const dir = join(OUT, `${photo}-${scene}`);
      if (!existsSync(join(dir, "log.json"))) continue;
      const log = JSON.parse(readFileSync(join(dir, "log.json"), "utf8"));
      const analysis = existsSync(join(dir, "analysis.json")) ? JSON.parse(readFileSync(join(dir, "analysis.json"), "utf8")) : null;
      const crop = analysis?.crop;
      const teeth = analysis?.teeth?.map((t) => t.fdi) ?? null;
      summary.push({
        photo,
        photoFile: log.photoFile,
        scene,
        outcome: log.outcome,
        skipped: log.skipped ?? null,
        seconds: Math.round((log.total ?? 0) / 1000),
        teeth,
        upperTeeth: teeth?.filter((f) => f[0] === "1" || f[0] === "2").length ?? null,
        lowerTeeth: teeth?.filter((f) => f[0] === "3" || f[0] === "4").length ?? null,
        centrals: analysis?.centrals ?? null,
        error: log.error ?? null,
        notes: log.notes ?? [],
        checkRefused: refusedByFunction(log),
        creationTitle: log.creationTitle ?? null,
        teethReadings: analysis?.teeth_readings ?? null,
        placement: log.placement ?? null,
        result: log.result ?? null,
      });
      const file = (n) => (existsSync(join(dir, n)) ? pathToFileURL(join(dir, n)).href : null);
      const result = file("result.jpg");
      // The result's close-up: the same region as the guide, cut from the full result by CSS.
      const closeUp =
        result && crop
          ? `<div style="width:420px;height:${Math.round((420 * crop.height) / crop.width)}px;background:url('${result}') no-repeat;background-size:${(420 * crop.photo_width) / crop.width}px auto;background-position:-${(420 * crop.x) / crop.width}px -${(420 * crop.y) / crop.width}px"></div>`
          : result
            ? `<img src="${result}" style="width:420px">`
            : `<div class="none">no result</div>`;
      const guide = file("guide.jpg") ? `<img src="${file("guide.jpg")}" style="width:420px">` : `<div class="none">no guide (fallback or error)</div>`;
      const pl = log.placement;
      const fit = pl ? `<br>fit: confidence ${pl.confidence}${pl.midline_error != null ? `, midline ${pl.midline_error}` : ""}${pl.issues?.length ? `, ${esc(pl.issues.join(", "))}` : ""}` : "";
      rows.push(`<tr><td class="t"><b>${scene}</b><br>${esc(SCENES[scene].what)}<br><br><b>${esc(isPlacementUncertain(log) ? "placement uncertain" : log.outcome)}</b> · ${Math.round(log.total / 1000)} s<br>teeth: ${esc(analysis?.teeth?.map((t) => t.fdi).join(" ") ?? "—")}${fit}<br><br>${esc(log.report ?? log.error ?? "").replace(/\n+/g, "<br>")}</td><td>${guide}</td><td>${closeUp}</td></tr>`);
    }
    if (!rows.length) continue;
    const html = `<!doctype html><meta charset="utf-8"><style>body{font:13px system-ui;margin:12px;background:#fff}td{vertical-align:top;padding:6px;border-bottom:1px solid #ddd}.t{width:330px}.none{width:420px;height:80px;background:#eee;display:grid;place-items:center;color:#777}h1{font-size:16px}</style><h1>${esc(photo)} — ${esc(basename(PHOTO_BY_KEY[photo]))}</h1><table><tr><th></th><th>Guide (computed marks)</th><th>Result (close-up)</th></tr>${rows.join("")}</table>`;
    const htmlPath = join(OUT, `sheet-${photo}.html`);
    writeFileSync(htmlPath, html);
    await page.goto(pathToFileURL(htmlPath).href);
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(OUT, `sheet-${photo}.jpg`), fullPage: true, type: "jpeg", quality: 82 });
  }
  writeFileSync(join(OUT, "summary.json"), JSON.stringify(summary, null, 1));
  writeFileSync(join(OUT, "report.md"), report(summary));
}

/** A short text report of the trial, to read or send as is (no photo in it). */
function report(summary) {
  const count = (pred) => summary.filter(pred).length;
  const first = (t) => (t ?? "").split("\n")[0].trim();
  const lines = [`# Try-on trial — ${new Date().toISOString().slice(0, 16).replace("T", " ")}`, ""];
  lines.push(`${Object.keys(PHOTO_BY_KEY).length} photo(s) × ${Object.keys(SCENES).length} creations, ${summary.length} runs, pixel midline ${summary.some((r) => r.placement?.arbiter === "applied") ? "applied" : "measured only"}:`);
  lines.push(`- results: ${count((r) => r.outcome === "result")}`);
  lines.push(`- photo refused by the check: ${count((r) => isPhotoRefusal(r) && !r.skipped)} (+ ${count((r) => r.skipped)} skipped after two refusals in a row)`);
  lines.push(`- placement too uncertain (the fit, not the photo check): ${count(isPlacementUncertain)}`);
  lines.push(`- render failed: ${count((r) => r.outcome === "error" && /n’a pas abouti/.test(r.error ?? ""))}`);
  const otherTitles = [...new Set(summary.filter((r) => r.creationTitle && r.creationTitle !== SCENES[r.scene].name).map((r) => `${r.scene}: "${r.creationTitle}"`))];
  if (otherTitles.length) lines.push(`- **creations not the ones described below** (another design under the same "Essai N —"): ${otherTitles.join(", ")}`);
  lines.push(`- other errors: ${count((r) => r.outcome === "error" && !isPhotoRefusal(r) && !isPlacementUncertain(r) && !/n’a pas abouti/.test(r.error ?? ""))}, harness errors: ${count((r) => r.outcome === "harness_error")}`);
  lines.push("", "## Per creation", "", "| Creation | Results | Refused | Failed | Notes (gems left out…) |", "| --- | --- | --- | --- | --- |");
  for (const s of Object.keys(SCENES)) {
    const rows = summary.filter((r) => r.scene === s);
    const notes = rows.flatMap((r) => r.notes).map((n) => n.replace(/\s+/g, " ").trim());
    lines.push(`| ${s} ${prefixOf(s)} | ${rows.filter((r) => r.outcome === "result").length}/${rows.length} | ${rows.filter((r) => isPhotoRefusal(r)).length} | ${rows.filter((r) => r.outcome !== "result" && !isPhotoRefusal(r)).length} | ${[...new Set(notes)].slice(0, 3).join(" · ") || "—"} |`);
  }
  // The placement (studio_try_on_placement) and how the image model kept the marks (studio_try_on_result), per run.
  const placed = summary.filter((r) => r.placement);
  if (placed.length) {
    const v = (x) => (x === null || x === undefined ? "—" : x);
    const arbiterCell = (p) => {
      if (!p.arbiter || p.arbiter === "unreadable") return p.arbiter ?? "—";
      if (!p.arbiter_gap_found) return p.arbiter_triggered ? "no clear gap" : "readings agree, no clear gap";
      const rebuilt = p.arbiter_segmented_upper || p.arbiter_segmented_lower ? `${p.arbiter_segmented_upper ?? 0} upper / ${p.arbiter_segmented_lower ?? 0} lower rebuilt` : null;
      const fixes = [...(p.arbiter_corrections ?? []), rebuilt, p.arbiter_snapped ? `${p.arbiter_snapped} snapped` : null].filter(Boolean).join(", ");
      const would = p.arbiter === "measured" ? `; would be ${p.arbiter_would_be_reliable ? "reliable" : "uncertain"}` : "";
      return `teeth ${v(p.arbiter_teeth_offset)}, box ${v(p.arbiter_centrals_offset)}${fixes ? `: ${fixes}` : ""}${would}`;
    };
    lines.push("", "## Placement and render, per run", "", "Midline: distance between the fitted midline and the photo check's central incisors (central incisor widths; over 0.5 makes the placement uncertain). Pixel midline: the function's 11/21 and the check's box against the darkest gap between the teeth (central incisor widths), what it corrected and how many teeth it rebuilt from the gaps, and — measured only — whether its placement would have been reliable. Drawn / drifted / resized: gems the image model drew, drew more than half a gem away from its mark, drew more than 30 % larger or smaller.", "", "| Run | Outcome | Confidence | Midline | Renumbered (upper, lower) | Issues | Pixel midline | Marks / left out | Drawn | Drifted | Resized | Moved back |", "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
    for (const r of placed) {
      const p = r.placement;
      const res = r.result;
      const outcome = r.outcome === "result" ? "ok" : isPlacementUncertain(r) ? "uncertain" : r.outcome;
      lines.push(`| ${r.photo}-${r.scene} | ${outcome} | ${v(p.confidence)} | ${v(p.midline_error)} | ${v(p.renumbered_upper)}, ${v(p.renumbered_lower)} | ${(p.issues ?? []).join(", ") || "—"} | ${arbiterCell(p)} | ${v(p.marks)} / ${v(p.left_out)} | ${res ? `${v(res.gems_drawn)}/${v(res.gems_checked)}` : "—"} | ${v(res?.gems_drifted)} | ${v(res?.gems_resized)} | ${v(res?.gems_reseated)} |`);
    }
  }
  lines.push("", "## Per photo", "", "| Photo | File | Upper / lower teeth found | Centrals | Outcomes | First error |", "| --- | --- | --- | --- | --- | --- |");
  for (const p of Object.keys(PHOTO_BY_KEY)) {
    const rows = summary.filter((r) => r.photo === p);
    if (!rows.length) continue;
    const a = rows.find((r) => r.teeth);
    const outcomes = rows.map((r) => `${r.scene}:${r.outcome === "result" ? "ok" : isPhotoRefusal(r) ? "refused" : isPlacementUncertain(r) ? "uncertain" : r.outcome === "error" ? "failed" : r.outcome}`).join(" ");
    lines.push(`| ${p} | ${basename(PHOTO_BY_KEY[p])} | ${a ? `${a.upperTeeth} / ${a.lowerTeeth}` : "—"} | ${a ? (a.centrals ? "yes" : "no") : "—"} | ${outcomes} | ${first(rows.find((r) => r.error)?.error) || "—"} |`);
  }
  lines.push("", "Send this file and the sheets (sheet-P*.jpg) for the analysis.", "");
  return lines.join("\n");
}

if (REPORT_ONLY) {
  browser = await chromium.launch();
  page = await browser.newPage();
  await contactSheets();
  console.log(`Report: ${join(OUT, "report.md")}, sheets: ${join(OUT, "sheet-P*.jpg")}`);
  await browser.close();
  process.exit(0);
}
await launch();
await checkCreations();
console.log(`Signed in as ${EMAIL}. ${photoFiles.length} photo(s) × ${Object.keys(SCENES).length} creations: ${pairs.length} runs, results in ${OUT}`);
/** Refused twice in a row by the photo check: the photo is not tried on its remaining creations. */
const REFUSALS_TO_SKIP = 2;
const refusalStreak = new Map(); // photo key → refusals in a row (a result or another outcome resets it)
const refusedPhotos = new Map(); // photo key → its last refusal's log, once the streak is reached
/** Counts a run's outcome in its photo's streak of refusals; true when the photo is now to be skipped. */
function countRefusal(photo, log) {
  const streak = isPhotoRefusal(log) ? (refusalStreak.get(photo) ?? 0) + 1 : 0;
  refusalStreak.set(photo, streak);
  if (streak < REFUSALS_TO_SKIP) return false;
  refusedPhotos.set(photo, log);
  return true;
}
let first = true;
let rendered = false; // whether the previous run reached the image model (its per-minute quota)
for (const [p, s] of pairs) {
  if (!PHOTO_BY_KEY[p] || !SCENES[s]) continue;
  if (argv.includes("--skip-done") && settled(p, s)) {
    // A run settled earlier still counts in the photo's streak of refusals.
    countRefusal(p, JSON.parse(readFileSync(join(OUT, `${p}-${s}`, "log.json"), "utf8")));
    continue;
  }
  const refusal = refusedPhotos.get(p);
  if (refusal) {
    // Recorded as refused too (same reasons), so the summary and the sheets show it, without another check.
    const dir = join(OUT, `${p}-${s}`);
    mkdirSync(dir, { recursive: true });
    const log = { photo: p, photoFile: refusal.photoFile, scene: s, sceneName: SCENES[s].name, outcome: "error", error: refusal.error, skipped: `photo refused ${REFUSALS_TO_SKIP} times in a row (last on ${refusal.scene})`, total: 0, calls: [] };
    writeFileSync(join(dir, "log.json"), JSON.stringify(log, null, 1));
    console.log(`${p}-${s}  skipped (photo refused ${REFUSALS_TO_SKIP} times in a row)`);
    continue;
  }
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (!alive()) {
      console.log("  (browser closed: relaunching and signing in again)");
      await launch();
    }
    if (!first) {
      // Only a run that reached the image model uses its per-minute quota: no pause after a refusal or an error.
      if (rendered) {
        console.log(`  (pause ${PAUSE_S} s: the image model's per-minute quota)`);
        await sleep(PAUSE_S);
      }
    }
    first = false;
    const log = await runOne(p, s);
    // A run that pressed Generate reached the image model, unless the photo check refused the photo first or the
    // placement was too uncertain to render. (The
    // render request itself carries Blobs, which Playwright's request events cannot read: it is not in log.calls.)
    rendered = log.clicked != null && !isPhotoRefusal(log) && !isPlacementUncertain(log);
    if (countRefusal(p, log)) {
      console.log(`  (${basename(PHOTO_BY_KEY[p])} refused ${REFUSALS_TO_SKIP} times in a row by the photo check: its other creations are skipped)`);
    } else if (isPhotoRefusal(log)) {
      console.log(`  (${basename(PHOTO_BY_KEY[p])} refused by the photo check: tried on the next creation, skipped after ${REFUSALS_TO_SKIP} refusals in a row)`);
    }
    const passing = log.outcome === "harness_error" || (log.outcome === "error" && /n’a pas abouti|connexion/i.test(log.error ?? ""));
    if (!passing || attempt === 2) break;
    console.log("  (passing failure: trying again in 60 s)");
    await sleep(60);
  }
}
if (!alive()) await launch();
await contactSheets();
console.log(`Done. Send back: ${join(OUT, "report.md")} and the ${Object.keys(PHOTO_BY_KEY).length} ${join(OUT, "sheet-P*.jpg")}`);
await browser?.close();
