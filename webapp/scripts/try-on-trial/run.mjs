// Studio try-on trial (decision 111 (k)): drives the real try-on dialog of the local site, connected to the real
// Supabase project, for every photo × test creation, with the computed placement — exactly as a staff member
// would: sign in, open the creation, add the photo, tick the consent, "Render with computed placement".
// See README.md next to this file. Nothing here holds a secret: the test account's password comes from the
// environment. The photos and the results stay on this machine.
//
//   node scripts/try-on-trial/run.mjs --photos <folder of 5 photos> [--out <folder>] [--only P3:S1,P5:S2] [--headed]
//
// Env: TRIAL_EMAIL, TRIAL_PASSWORD (the test staff account); TRIAL_SITE (default http://localhost:5173).
import { chromium } from "@playwright/test";
import { existsSync, mkdirSync, readdirSync, writeFileSync, readFileSync } from "node:fs";
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
const SITE = process.env.TRIAL_SITE || "http://localhost:5173";
const EMAIL = process.env.TRIAL_EMAIL;
const PASSWORD = process.env.TRIAL_PASSWORD;
if (!PHOTOS || !EMAIL || !PASSWORD) {
  console.error("Usage: TRIAL_EMAIL=… TRIAL_PASSWORD=… node scripts/try-on-trial/run.mjs --photos <folder> [--out <folder>] [--only P1:S1,…] [--headed]");
  process.exit(1);
}

// The five test creations, saved on the test account (names as in My Creations).
const SCENES = {
  S1: { name: "Essai 1 — Référence (un carré au centre de la 11)", what: "One 3 mm square crystal, centre of 11" },
  S2: { name: "Essai 2 — Symétrie (cœurs sur 12 et 22)", what: "Mirror pair: 4 mm fuchsia hearts on 12 and 22" },
  S3: { name: "Essai 3 — Petit groupe (4 gemmes de 3 mm sur la 21)", what: "Cluster: four 3 mm gems on 21" },
  S4: { name: "Essai 4 — Côtés et bas (canines 13/23, incisive 31)", what: "Canines 13/23 (4 mm drops) + lower incisor 31 (3 mm baguette, 90°)" },
  S5: { name: "Essai 5 — Formes et matières", what: "Gold bolt 30° on 11, AB drop 180° on 21, AB rivoli star on 22" },
};
const photoFiles = readdirSync(PHOTOS)
  .filter((f) => /\.(jpe?g|png|webp|heic)$/i.test(f))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  .slice(0, 5);
const PHOTO_BY_KEY = Object.fromEntries(photoFiles.map((f, i) => [`P${i + 1}`, join(PHOTOS, f)]));
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
// Behind a proxy (HTTPS_PROXY set), the browser uses it too; local pages stay direct.
const proxy = process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY, bypass: "localhost,127.0.0.1" } } : {};
const browser = await chromium.launch({ headless: !HEADED, ...proxy });
const context = await browser.newContext({ locale: "fr-FR", viewport: { width: 1280, height: 1000 } });
// The guide (a Blob in a FormData) is not visible to Playwright's request events: the page hands it over itself.
let onGuide = null;
await context.exposeBinding("__trialGuide", (_source, b64) => onGuide?.(b64));
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
const page = await context.newPage();
page.setDefaultTimeout(60_000);

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

async function runOne(photo, scene) {
  const dir = join(OUT, `${photo}-${scene}`);
  mkdirSync(dir, { recursive: true });
  const log = { photo, photoFile: basename(PHOTO_BY_KEY[photo]), scene, sceneName: SCENES[scene].name, started: new Date().toISOString(), calls: [] };
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
    await page.goto(`${SITE}/studio-3d/atelier/mes-creations`, { waitUntil: "domcontentloaded" });
    const details = page.getByRole("button", { name: `Voir le détail de ${SCENES[scene].name}` });
    await details.first().waitFor({ timeout: 90_000 });
    await details.first().click();
    await page.getByRole("button", { name: "Essayer sur un sourire" }).first().click();
    const dialog = page.getByRole("dialog").filter({ hasText: "Essayer sur un sourire" }).last();
    await dialog.locator('input[type="file"][accept^="image/jpeg"]').setInputFiles(PHOTO_BY_KEY[photo]);
    await dialog.getByText("La personne photographiée m’a donné son accord", { exact: false }).click();
    const computed = dialog.getByRole("button", { name: "Rendu à placement calculé" });
    await computed.waitFor({ timeout: 60_000 });
    await page.waitForFunction((el) => !el.disabled, await computed.elementHandle(), { timeout: 60_000 });
    log.clicked = Date.now() - t0;
    await computed.click();
    const report = dialog.locator("text=/Placement (calculé à partir|par l’IA)/");
    const error = dialog.getByRole("alert");
    await Promise.race([report.first().waitFor({ timeout: 900_000 }), error.first().waitFor({ timeout: 900_000 })]);
    log.ended = Date.now() - t0;
    if (await report.count()) {
      log.outcome = "result";
      log.report = (await report.first().locator("xpath=ancestor::div[contains(@class,'border')][1]").innerText().catch(() => "")).trim();
      const img = dialog.locator('img[alt*="essayé sur la photo"]').first();
      const b64 = await page.evaluate(async (u) => {
        const buf = new Uint8Array(await (await (await fetch(u)).blob()).arrayBuffer());
        let s = "";
        for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
        return btoa(s);
      }, await img.getAttribute("src"));
      writeFileSync(join(dir, "result.jpg"), Buffer.from(b64, "base64"));
      log.notes = (await dialog.locator("p").allInnerTexts()).filter((t) => /gemme|non dessinée|cachée/i.test(t)).slice(0, 3);
    } else {
      log.outcome = "error";
      log.error = (await error.first().innerText()).trim();
    }
    await dialog.screenshot({ path: join(dir, "dialog.png") }).catch(() => {});
  } catch (e) {
    log.outcome = "harness_error";
    log.error = String(e).slice(0, 600);
    await page.screenshot({ path: join(dir, "harness-error.png") }).catch(() => {});
  } finally {
    onGuide = null;
    page.off("request", onRequest);
    page.off("response", onResponse);
    log.total = Date.now() - t0;
    writeFileSync(join(dir, "log.json"), JSON.stringify(log, null, 1));
    const first = log.report?.split("\n").filter(Boolean).slice(0, 2).join(" · ") ?? log.error?.split("\n")[0] ?? "";
    console.log(`${photo}-${scene}  ${log.outcome}  ${Math.round(log.total / 1000)}s  ${first}`);
  }
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
      summary.push({ photo, scene, outcome: log.outcome, seconds: Math.round(log.total / 1000), teeth: analysis?.teeth?.map((t) => t.fdi) ?? null, report: log.report ?? null, error: log.error ?? null, notes: log.notes ?? [] });
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
      rows.push(`<tr><td class="t"><b>${scene}</b><br>${esc(SCENES[scene].what)}<br><br><b>${esc(log.outcome)}</b> · ${Math.round(log.total / 1000)} s<br>teeth: ${esc(analysis?.teeth?.map((t) => t.fdi).join(" ") ?? "—")}<br><br>${esc(log.report ?? log.error ?? "").replace(/\n+/g, "<br>")}</td><td>${guide}</td><td>${closeUp}</td></tr>`);
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
}

await signIn();
console.log(`Signed in as ${EMAIL}. ${pairs.length} runs, results in ${OUT}`);
for (const [p, s] of pairs) {
  if (!PHOTO_BY_KEY[p] || !SCENES[s]) continue;
  if (argv.includes("--skip-done") && existsSync(join(OUT, `${p}-${s}`, "result.jpg"))) continue;
  await runOne(p, s);
}
await contactSheets();
console.log(`Done. Send back: ${join(OUT, "summary.json")} and the five ${join(OUT, "sheet-P*.jpg")}`);
await browser.close();
