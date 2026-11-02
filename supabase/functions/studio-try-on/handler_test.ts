import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import jpegCodec from "npm:jpeg-js@0.4.4";
import { readSiteOrigins } from "../_shared/http.ts";
import { mouthCrop, nearestRatio } from "./crop.ts";
import { accessToken, generateImage, generateUrl, imageModelConfig, nearestAspectRatio, readAdcJson, readImage, resetTokenCache } from "./gemini.ts";
import { handleStudioTryOn, headerSize, readCropRect, readSourceRef, type StudioTryOnDeps, type TryOnCreationRow } from "./handler.ts";
import { imageSize, judgePhoto, judgeReadings, MIN_TEETH_SPAN } from "./photoCheck.ts";
import { TRY_ON_SYSTEM_PROMPT } from "./systemPrompt.ts";
import { readTeeth } from "./teeth.ts";

const SITE = "https://global-toothgems.example";
const TOKEN = "member.jwt.sig";
const CREATION = "7d4e8f0a-1b2c-4d3e-8f9a-0b1c2d3e4f5a";
const SCENE = {
  version: 2,
  pieces: [{ id: "p1", toothId: "21", size: { mm: [3] }, scale: 1.5, look: { shape: "square", material: "crystal", color: "#ffffff", effect: "none" } }],
};
const TEETH_ANSWER = { teeth: [{ fdi: "11", box: [100, 300, 700, 500] }, { fdi: "21", box: [100, 500, 700, 700] }] };
const GOOD_PHOTO = {
  teeth_visible: true,
  teeth_covered: false,
  teeth_box: [430, 240, 560, 810],
  central_incisors_box: [430, 420, 560, 600],
  sharpness: "sharp",
  lighting: "good",
  head_pose: "frontal",
  central_incisors_visible: true,
};

function fake(over: Partial<StudioTryOnDeps> = {}, row: TryOnCreationRow | null = { creationId: CREATION, source: "own", scene: SCENE, allowed: true }) {
  const calls = { started: 0, finished: [] as string[], images: [] as string[], text: "", ratio: null as string | null, teethSize: null as unknown };
  const deps: StudioTryOnDeps = {
    origins: readSiteOrigins(SITE, undefined),
    available: true,
    dailyLimit: 3,
    dailyChecks: 5,
    userFromToken: (token) => Promise.resolve(token === TOKEN ? "user-1" : null),
    loadCreation: () => Promise.resolve(row),
    unlimited: () => Promise.resolve(false),
    countRecent: () => Promise.resolve({ requests: 0, renders: 0 }),
    startRequest: () => {
      calls.started++;
      return Promise.resolve("req-1");
    },
    finishRequest: (_id, status, code) => {
      calls.finished.push(code ? `${status}:${code}` : status);
      return Promise.resolve();
    },
    references: () => Promise.resolve([{ mimeType: "image/jpeg", data: "cmVm" }]),
    checkPhoto: () => Promise.resolve({ ok: true, value: GOOD_PHOTO }),
    findTeeth: (image) => {
      calls.teethSize = imageSize(Uint8Array.from(atob(image.data), (c) => c.charCodeAt(0)));
      return Promise.resolve({ ok: true, value: TEETH_ANSWER });
    },
    generate: (images, text, ratio) => {
      calls.images = images.map((img) => `${img.mimeType}:${img.data}`);
      calls.text = text;
      calls.ratio = ratio;
      return Promise.resolve({ ok: true, image: { mimeType: "image/png", data: "aW1n" } });
    },
    log: () => {},
    ...over,
  };
  return { deps, calls };
}

/** A real JPEG of this size (flat grey). */
function jpegOf(width: number, height: number): Blob {
  const data = new Uint8Array(width * height * 4).fill(128);
  return new Blob([new Uint8Array(jpegCodec.encode({ data, width, height }, 80).data)], { type: "image/jpeg" });
}

function analyseForm(source: unknown = { creation_id: CREATION }, photo: Blob | null = jpegOf(768, 1024)) {
  const data = new FormData();
  data.set("action", "analyse");
  data.set("source", JSON.stringify(source));
  if (photo) data.set("photo", photo, "smile.jpg");
  return data;
}

function renderForm(over: { crop?: unknown; marks?: string; guide?: Blob | null; design?: Blob | null; photo?: Blob | null; source?: unknown } = {}) {
  const data = new FormData();
  data.set("source", JSON.stringify(over.source ?? { creation_id: CREATION }));
  const photo = over.photo === undefined ? jpegOf(768, 1024) : over.photo;
  if (photo) data.set("photo", photo, "smile.jpg");
  const design = over.design === undefined ? new Blob([new Uint8Array([4, 5])], { type: "image/png" }) : over.design;
  if (design) data.set("design", design, "design.png");
  const guide = over.guide === undefined ? jpegOf(400, 300) : over.guide;
  if (guide) data.set("guide", guide, "guide.jpg");
  data.set("crop", JSON.stringify(over.crop ?? { x: 100, y: 500, width: 400, height: 300 }));
  data.set("marks", over.marks ?? "3");
  return data;
}

const post = (body: FormData | string, token: string | null = TOKEN) =>
  new Request("https://fn.example/studio-try-on", {
    method: "POST",
    headers: {
      origin: SITE,
      ...(typeof body === "string" ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body,
  });

Deno.test("status: says whether the AI is connected, without an account", async () => {
  const { deps } = fake({ available: false });
  const res = await handleStudioTryOn(post('{"action":"status"}', null), deps);
  assertEquals(await res.json(), { available: false, daily_limit: 3, quota: null });
});

Deno.test("status: the member's renders left; none once the requests cap is reached; administrators unlimited", async () => {
  const used = fake({ countRecent: () => Promise.resolve({ requests: 2, renders: 1 }) });
  assertEquals((await (await handleStudioTryOn(post('{"action":"status"}'), used.deps)).json()).quota, { limit: 3, remaining: 2 });
  const capped = fake({ countRecent: () => Promise.resolve({ requests: 5, renders: 0 }) });
  assertEquals((await (await handleStudioTryOn(post('{"action":"status"}'), capped.deps)).json()).quota, { limit: 3, remaining: 0 });
  const admin = fake({ unlimited: () => Promise.resolve(true) });
  assertEquals((await (await handleStudioTryOn(post('{"action":"status"}'), admin.deps)).json()).quota, { unlimited: true });
  const stranger = fake();
  assertEquals((await (await handleStudioTryOn(post('{"action":"status"}', "other.jwt.sig"), stranger.deps)).json()).quota, null);
});

Deno.test("not connected: nothing is read or counted", async () => {
  const { deps, calls } = fake({ available: false });
  const res = await handleStudioTryOn(post(analyseForm()), deps);
  assertEquals(res.status, 503);
  assertEquals(calls.started, 0);
});

Deno.test("refusals: no token, expired, unknown creation, owner without the plan, empty creation, daily limits", async () => {
  assertEquals((await handleStudioTryOn(post(analyseForm(), null), fake().deps)).status, 401);
  assertEquals((await handleStudioTryOn(post(analyseForm(), "other.jwt.sig"), fake().deps)).status, 401);
  assertEquals((await handleStudioTryOn(post(analyseForm()), fake({}, null).deps)).status, 404);
  assertEquals((await handleStudioTryOn(post(analyseForm()), fake({}, { creationId: CREATION, source: "own", scene: SCENE, allowed: false }).deps)).status, 403);
  assertEquals((await handleStudioTryOn(post(analyseForm()), fake({}, { creationId: CREATION, source: "own", scene: { pieces: [] }, allowed: true }).deps)).status, 404);
  // The analysis counts against the requests, the render against the renders.
  const requestsUsed = fake({ countRecent: () => Promise.resolve({ requests: 5, renders: 0 }) });
  assertEquals((await handleStudioTryOn(post(analyseForm()), requestsUsed.deps)).status, 429);
  const rendersUsed = fake({ countRecent: () => Promise.resolve({ requests: 3, renders: 3 }) });
  assertEquals((await handleStudioTryOn(post(analyseForm()), rendersUsed.deps)).status, 200);
  assertEquals((await handleStudioTryOn(post(renderForm()), fake({ countRecent: () => Promise.resolve({ requests: 3, renders: 3 }) }).deps)).status, 429);
  // An administrator has no limit.
  const admin = fake({ unlimited: () => Promise.resolve(true), countRecent: () => Promise.resolve({ requests: 99, renders: 99 }) });
  assertEquals((await handleStudioTryOn(post(renderForm()), admin.deps)).status, 200);
});

Deno.test("analysis: the close-up and its teeth, nothing generated, recorded as an analysis", async () => {
  let generated = false;
  const { deps, calls } = fake({
    generate: () => {
      generated = true;
      return Promise.resolve({ ok: false, code: "failed" });
    },
  });
  const res = await handleStudioTryOn(post(analyseForm()), deps);
  assertEquals(res.status, 200);
  const body = await res.json();
  const crop = mouthCrop(GOOD_PHOTO.teeth_box, { width: 768, height: 1024 })!;
  assertEquals(body.crop, { ...crop, photo_width: 768, photo_height: 1024 });
  // The teeth are found on the close-up, their boxes in its pixels.
  assertEquals(calls.teethSize, { width: crop.width, height: crop.height });
  assertEquals(body.teeth, readTeeth(TEETH_ANSWER, { width: crop.width, height: crop.height }));
  assertEquals(generated, false);
  assertEquals(calls.finished, ["failed:analysis"]);
});

Deno.test("analysis: an unsuitable photo is refused with its reasons, recorded; a failed check never blocks", async () => {
  const refused = fake({ checkPhoto: () => Promise.resolve({ ok: true, value: { ...GOOD_PHOTO, teeth_box: [600, 450, 640, 550], lighting: "too_dark" } }) });
  const res = await handleStudioTryOn(post(analyseForm()), refused.deps);
  assertEquals(res.status, 422);
  assertEquals(await res.json(), { ok: false, code: "photo_unsuitable", reasons: ["too_far", "too_dark"] });
  assertEquals(refused.calls.finished, ["failed:photo_unsuitable"]);
  const down = fake({ checkPhoto: () => Promise.reject(new Error("boom")) });
  const whole = await (await handleStudioTryOn(post(analyseForm()), down.deps)).json();
  // No check: no teeth box, so no crop — the whole photo is analysed.
  assertEquals(whole.crop, { x: 0, y: 0, width: 768, height: 1024, photo_width: 768, photo_height: 1024 });
});

Deno.test("analysis: the teeth model failing is a failure, still recorded", async () => {
  const { deps, calls } = fake({ findTeeth: () => Promise.reject(new Error("boom")) });
  const res = await handleStudioTryOn(post(analyseForm()), deps);
  assertEquals(res.status, 502);
  assertEquals(calls.finished, ["failed:analysis"]);
});

Deno.test("render: the guide, the close-up cut here and the design, then the references; the v4 prompt's data", async () => {
  const { deps, calls } = fake();
  const res = await handleStudioTryOn(post(renderForm()), deps);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.image, { mime_type: "image/png", data: "aW1n" });
  assertEquals(body.crop, { x: 100, y: 500, width: 400, height: 300, photo_width: 768, photo_height: 1024 });
  assertEquals(calls.images.length, 4);
  const second = Uint8Array.from(atob(calls.images[1].split(":")[1]), (c) => c.charCodeAt(0));
  assertEquals(imageSize(second), { width: 400, height: 300 });
  assertEquals(calls.images[2], "image/png:BAU=");
  assertEquals(calls.images[3], "image/jpeg:cmVm");
  assertStringIncludes(calls.text, "IMAGE 1 holds 3 gem marks");
  assertEquals(calls.ratio, nearestAspectRatio({ width: 400, height: 300 }));
  assertEquals(calls.finished, ["generated"]);
  assertStringIncludes(TRY_ON_SYSTEM_PROMPT, "THE ONE RULE: KEEP THE PLACEMENT");
});

Deno.test("render: the guide, the design, the crop and the marks are checked", async () => {
  for (const bad of [
    renderForm({ crop: { x: 500, y: 900, width: 400, height: 300 } }), // past the photo
    renderForm({ crop: { x: 0, y: 0, width: 10, height: 10 } }), // too small
    renderForm({ crop: "nope" }),
    renderForm({ marks: "0" }),
    renderForm({ marks: "2.5" }),
    renderForm({ guide: null }),
    renderForm({ guide: new Blob([new Uint8Array([1, 2])], { type: "image/png" }) }),
    renderForm({ design: null }),
    renderForm({ photo: new Blob([new Uint8Array([1, 2])], { type: "image/png" }) }),
    renderForm({ source: { creation_id: CREATION, token: "x" } }),
  ]) {
    assertEquals((await handleStudioTryOn(post(bad), fake().deps)).status, 400);
  }
});

Deno.test("render: a provider failure is recorded and reported", async () => {
  const { deps, calls } = fake({ generate: () => Promise.resolve({ ok: false, code: "blocked", detail: "SAFETY" }) });
  const res = await handleStudioTryOn(post(renderForm()), deps);
  assertEquals(res.status, 502);
  assertEquals(await res.json(), { ok: false, code: "blocked" });
  assertEquals(calls.finished, ["failed:blocked"]);
});

Deno.test("readCropRect: whole pixels inside the photo, at least 64 px", () => {
  const size = { width: 800, height: 600 };
  assertEquals(readCropRect('{"x":10,"y":20,"width":300,"height":200}', size), { x: 10, y: 20, width: 300, height: 200 });
  assertEquals(readCropRect('{"x":10.5,"y":20,"width":300,"height":200}', size), null);
  assertEquals(readCropRect('{"x":600,"y":20,"width":300,"height":200}', size), null);
  assertEquals(readCropRect('{"x":0,"y":0,"width":300,"height":200}', null), null);
  assertEquals(readCropRect(null, size), null);
});


Deno.test("judgePhoto: clear reasons only, the teeth's span against the longer side", () => {
  assertEquals(judgePhoto(GOOD_PHOTO, null), { issues: [], span: 0.57 });
  assertEquals(judgePhoto({ ...GOOD_PHOTO, teeth_visible: false }, null).issues, ["no_teeth"]);
  assertEquals(judgePhoto({ ...GOOD_PHOTO, teeth_covered: true, sharpness: "blurred", lighting: "overexposed" }, null).issues, ["teeth_hidden", "too_bright", "blurry"]);
  // Only a face-on smile passes: turned (even slightly), or a front tooth not facing the camera, is refused.
  assertEquals(judgePhoto({ ...GOOD_PHOTO, head_pose: "strongly_turned" }, null).issues, ["not_frontal"]);
  assertEquals(judgePhoto({ ...GOOD_PHOTO, head_pose: "slightly_turned" }, null).issues, ["not_frontal"]);
  assertEquals(judgePhoto({ ...GOOD_PHOTO, central_incisors_visible: false }, null).issues, ["not_frontal"]);
  // No answer on the pose: not held against the photo.
  assertEquals(judgePhoto({ ...GOOD_PHOTO, head_pose: undefined }, null).issues, []);
  // Soft or dim but readable: not refused.
  assertEquals(judgePhoto({ ...GOOD_PHOTO, sharpness: "slightly_blurred", lighting: "dim" }, null).issues, []);
  // A selfie of the whole face, portrait: the teeth span 28 % of the width, 21 % of the longer side.
  const face = judgePhoto({ ...GOOD_PHOTO, teeth_box: [540, 360, 600, 640] }, { width: 896, height: 1195 });
  assertEquals(face, { issues: ["too_far"], span: 0.21 });
  assertEquals(face.span! < MIN_TEETH_SPAN, true);
  // Missing or malformed facts are not held against the photo.
  assertEquals(judgePhoto({}, null), { issues: [], span: null });
  assertEquals(judgePhoto({ ...GOOD_PHOTO, teeth_box: [10, 900, 20, 100] }, null).issues, []);
});

Deno.test("imageSize: JPEG and PNG headers", () => {
  // SOI, APP0 (length 4), SOF0: precision 8, height 1195, width 896.
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x04, 0xab, 0x03, 0x80, 0x03, 0, 0, 0, 0]);
  assertEquals(imageSize(jpeg), { width: 896, height: 1195 });
  const png = new Uint8Array(32);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  new DataView(png.buffer).setUint32(16, 640);
  new DataView(png.buffer).setUint32(20, 480);
  assertEquals(imageSize(png), { width: 640, height: 480 });
  assertEquals(imageSize(new Uint8Array([1, 2, 3])), null);
});

Deno.test("readSourceRef: exactly one well-formed reference", () => {
  assertEquals(readSourceRef(JSON.stringify({ creation_id: CREATION.toUpperCase() })), { creationId: CREATION });
  assertEquals(readSourceRef(JSON.stringify({ token: "a".repeat(48) })), { token: "a".repeat(48) });
  assertEquals(readSourceRef(JSON.stringify({ handle: "Aurora.Gems", item_id: CREATION })), { handle: "aurora.gems", itemId: CREATION });
  assertEquals(readSourceRef(JSON.stringify({ token: "short" })), null);
  assertEquals(readSourceRef(JSON.stringify({ handle: "aurora" })), null);
  assertEquals(readSourceRef("not json"), null);
});

const ADC = JSON.stringify({
  type: "authorized_user",
  client_id: "cid.apps.googleusercontent.com",
  client_secret: "csecret",
  refresh_token: "rtoken",
  quota_project_id: "global-toothgems",
});

Deno.test("ADC: an authorized_user file opens Vertex AI, its quota project by default", () => {
  assertEquals(readAdcJson(JSON.stringify({ type: "service_account" })), null);
  assertEquals(readAdcJson("not json"), null);
  const env = (vars: Record<string, string>) => (n: string) => vars[n];
  const config = imageModelConfig(env({ GOOGLE_ADC_JSON: ADC, GEMINI_IMAGE_MODEL: "model-x", GEMINI_API_KEY: "k" }));
  assertEquals(config?.kind, "vertex");
  assertEquals(
    generateUrl(config!),
    "https://aiplatform.googleapis.com/v1/projects/global-toothgems/locations/global/publishers/google/models/model-x:generateContent",
  );
  const regional = imageModelConfig(env({ GOOGLE_ADC_JSON: ADC, GEMINI_IMAGE_MODEL: "model-x", GOOGLE_CLOUD_LOCATION: "europe-west1", GOOGLE_CLOUD_PROJECT: "other-proj" }));
  assertEquals(
    generateUrl(regional!),
    "https://europe-west1-aiplatform.googleapis.com/v1/projects/other-proj/locations/europe-west1/publishers/google/models/model-x:generateContent",
  );
  assertEquals(imageModelConfig(env({ GOOGLE_ADC_JSON: ADC })), null); // no model
});

Deno.test("ADC: the refresh token buys an access token, cached, sent with the quota project", async () => {
  resetTokenCache();
  const seen: { url: string; headers: Record<string, string>; body: string }[] = [];
  const fakeFetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    seen.push({ url, headers: (init?.headers ?? {}) as Record<string, string>, body: String(init?.body ?? "") });
    if (url.startsWith("https://oauth2.googleapis.com/token")) {
      return Promise.resolve(new Response(JSON.stringify({ access_token: "ya29.token", expires_in: 3599 }), { status: 200 }));
    }
    return Promise.resolve(
      new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "QQ==" } }] } }] }), { status: 200 }),
    );
  }) as typeof fetch;
  const config = imageModelConfig((n) => ({ GOOGLE_ADC_JSON: ADC, GEMINI_IMAGE_MODEL: "model-x" } as Record<string, string>)[n])!;
  const out = await generateImage(config, "system", [{ mimeType: "image/png", data: "AA==" }], "DESIGN DATA", fakeFetch);
  assertEquals(out, { ok: true, image: { mimeType: "image/png", data: "QQ==" } });
  assertStringIncludes(seen[0].body, "grant_type=refresh_token");
  assertStringIncludes(seen[0].body, "refresh_token=rtoken");
  assertEquals(seen[1].headers.authorization, "Bearer ya29.token");
  assertEquals(seen[1].headers["x-goog-user-project"], "global-toothgems");
  const body = JSON.parse(seen[1].body);
  assertEquals(body.systemInstruction.parts[0].text, "system");
  assertEquals(body.contents[0].parts, [{ inlineData: { mimeType: "image/png", data: "AA==" } }, { text: "DESIGN DATA" }]);
  // Cached: a second render does not refresh again.
  await accessToken({ clientId: "cid.apps.googleusercontent.com", clientSecret: "csecret", refreshToken: "rtoken" }, fakeFetch);
  assertEquals(seen.filter((s) => s.url.includes("oauth2")).length, 1);
  resetTokenCache();
});

Deno.test("service account: the signed JWT is traded for a token, no user project header", async () => {
  resetTokenCache();
  const pair = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const der = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...der)).replace(/(.{64})/g, "$1\n")}\n-----END PRIVATE KEY-----\n`;
  const file = JSON.stringify({ type: "service_account", project_id: "gt-ai", client_email: "tryon@gt-ai.iam.gserviceaccount.com", private_key: pem });
  assertEquals(readAdcJson(JSON.stringify({ type: "service_account", client_email: "x" })), null);
  const config = imageModelConfig((n) => ({ GOOGLE_ADC_JSON: file, GEMINI_IMAGE_MODEL: "model-x" } as Record<string, string>)[n])!;
  assertEquals(config.kind, "vertex");
  assertStringIncludes(generateUrl(config), "/projects/gt-ai/");
  const seen: { url: string; headers: Record<string, string>; body: string }[] = [];
  const fakeFetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    seen.push({ url, headers: (init?.headers ?? {}) as Record<string, string>, body: String(init?.body ?? "") });
    if (url.startsWith("https://oauth2.googleapis.com/token")) return Promise.resolve(new Response(JSON.stringify({ access_token: "ya29.sa", expires_in: 3599 }), { status: 200 }));
    return Promise.resolve(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "QQ==" } }] } }] }), { status: 200 }));
  }) as typeof fetch;
  assertEquals((await generateImage(config, "system", [{ mimeType: "image/png", data: "AA==" }], null, fakeFetch)).ok, true);
  const form = new URLSearchParams(seen[0].body);
  assertEquals(form.get("grant_type"), "urn:ietf:params:oauth:grant-type:jwt-bearer");
  const [h, c, sig] = form.get("assertion")!.split(".");
  const b64 = (v: string) => Uint8Array.from(atob(v.replace(/-/g, "+").replace(/_/g, "/")), (ch) => ch.charCodeAt(0));
  assertEquals(JSON.parse(atob(h)), { alg: "RS256", typ: "JWT" });
  const claims = JSON.parse(atob(c.replace(/-/g, "+").replace(/_/g, "/")));
  assertEquals(claims.iss, "tryon@gt-ai.iam.gserviceaccount.com");
  assertEquals(claims.scope, "https://www.googleapis.com/auth/cloud-platform");
  assertEquals(claims.aud, "https://oauth2.googleapis.com/token");
  assertEquals(
    await crypto.subtle.verify("RSASSA-PKCS1-v1_5", pair.publicKey, b64(sig), new TextEncoder().encode(`${h}.${c}`)),
    true,
  );
  assertEquals(seen[1].headers.authorization, "Bearer ya29.sa");
  assertEquals(seen[1].headers["x-goog-user-project"], undefined);
  resetTokenCache();
});

Deno.test("gemini: config needs both secrets; the answer's first image is read", () => {
  assertEquals(imageModelConfig(() => undefined), null);
  assertEquals(imageModelConfig((n) => (n === "GEMINI_API_KEY" ? "k" : undefined)), null);
  assertEquals(imageModelConfig((n) => ({ GEMINI_API_KEY: "k", GEMINI_IMAGE_MODEL: "model-x" } as Record<string, string>)[n])?.model, "model-x");
  assertEquals(readImage({ candidates: [{ content: { parts: [{ text: "hi" }, { inlineData: { mimeType: "image/png", data: "QQ==" } }] } }] }), {
    ok: true,
    image: { mimeType: "image/png", data: "QQ==" },
  });
  assertEquals(readImage({ promptFeedback: { blockReason: "SAFETY" } }).ok, false);
  assertEquals(readImage({ candidates: [{ finishReason: "IMAGE_SAFETY", content: { parts: [] } }] }), { ok: false, code: "blocked", detail: "IMAGE_SAFETY" });
  assertEquals(readImage(null), { ok: false, code: "failed", detail: "no image in the answer" });
});

Deno.test("aspect ratio: the photo's proportions are asked for; a model refusing the option is asked again without it", async () => {
  assertEquals(nearestAspectRatio({ width: 896, height: 1195 }), "3:4");
  assertEquals(nearestAspectRatio({ width: 2048, height: 1152 }), "16:9");
  assertEquals(nearestAspectRatio({ width: 1000, height: 1000 }), "1:1");
  assertEquals(nearestAspectRatio(null), null);

  const bodies: Record<string, unknown>[] = [];
  const fakeFetch = ((_input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    bodies.push(body);
    if (body.generationConfig?.imageConfig) return Promise.resolve(new Response("unknown field imageConfig", { status: 400 }));
    return Promise.resolve(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "QQ==" } }] } }] }), { status: 200 }));
  }) as typeof fetch;
  const config = imageModelConfig((n) => ({ GEMINI_API_KEY: "k", GEMINI_IMAGE_MODEL: "model-x" } as Record<string, string>)[n])!;
  const out = await generateImage(config, "system", [{ mimeType: "image/png", data: "AA==" }], null, fakeFetch, 1000, "3:4");
  assertEquals(out.ok && out.aspectRatioDropped, true);
  assertEquals(bodies.length, 2);
  assertEquals((bodies[0].generationConfig as Record<string, unknown>).imageConfig, { aspectRatio: "3:4" });
  assertEquals((bodies[1].generationConfig as Record<string, unknown>).imageConfig, undefined);
});


Deno.test("mouthCrop: teeth and lips at a model proportion, inside the photo; none when useless", () => {
  const size = { width: 1536, height: 2048 };
  // The smile of the reported render: teeth across the middle of a tall face photo.
  const crop = mouthCrop([430, 240, 560, 810], size)!;
  const ratio = crop.width / crop.height;
  assertEquals(Math.abs(ratio - nearestRatio(ratio)) < 0.01, true);
  // The teeth are inside, with room around them.
  assertEquals(crop.x < 240 * 1.536 && crop.x + crop.width > 810 * 1.536, true);
  assertEquals(crop.y < 430 * 2.048 && crop.y + crop.height > 560 * 2.048, true);
  assertEquals(crop.x >= 0 && crop.y >= 0 && crop.x + crop.width <= size.width && crop.y + crop.height <= size.height, true);
  // A close-up of the mouth already, a missing box or tiny teeth: the whole photo.
  assertEquals(mouthCrop([100, 50, 900, 950], size), null);
  assertEquals(mouthCrop([], size), null);
  assertEquals(mouthCrop([500, 500, 505, 520], size), null);
  assertEquals(mouthCrop([430, 240, 560, 810], null), null);
});

Deno.test("teeth: valid FDI numbers and boxes in pixels; misreadings dropped", () => {
  const teeth = readTeeth(
    {
      teeth: [
        { fdi: "11", box: [100, 400, 600, 500] },
        { fdi: "11", box: [100, 300, 600, 400] }, // the same number twice: the first kept
        { fdi: "19", box: [100, 300, 600, 400] }, // not a tooth number
        { fdi: "17", box: [100, 300, 600, 400] }, // a second molar: not a front tooth
        { fdi: "21", box: [100, 500, 600, 500] }, // no width
        { fdi: "12", box: [100, 300, 600] }, // three numbers
        { fdi: " 22 ", box: [-50, 600, 600, 1200] }, // clamped to the image
        "nonsense",
      ],
    },
    { width: 2000, height: 1000 },
  );
  assertEquals(teeth, [
    { fdi: "11", x: 800, y: 100, width: 200, height: 500 },
    { fdi: "22", x: 1200, y: 0, width: 800, height: 600 },
  ]);
  assertEquals(readTeeth(null, { width: 10, height: 10 }), []);
  assertEquals(readTeeth({ teeth: "x" }, { width: 10, height: 10 }), []);
});

Deno.test("photo readings: the photo is read twice and the strictest reading decides", async () => {
  const size = { width: 1536, height: 2048 };
  // The reported photo: one reading measured the teeth at 0.22 of the longer side and a turned head, the other at 0.33.
  const strict = { ...GOOD_PHOTO, teeth_box: [520, 330, 600, 610], head_pose: "slightly_turned" };
  const lenient = { ...GOOD_PHOTO, teeth_box: [500, 230, 620, 670] };
  const { verdict, reading, spans } = judgeReadings([lenient, strict], size);
  assertEquals(verdict.issues, ["too_far", "not_frontal"]);
  assertEquals(spans, [0.33, 0.21]);
  assertEquals(reading, strict);

  const readings: number[] = [];
  const answers = [lenient, strict];
  const { deps, calls } = fake({
    checkPhoto: (_photo, i) => {
      readings.push(i);
      return Promise.resolve({ ok: true, value: answers[i] });
    },
  });
  const res = await handleStudioTryOn(post(analyseForm()), deps);
  assertEquals(res.status, 422);
  assertEquals(readings.sort(), [0, 1]);
  assertEquals(calls.images.length, 0);
  // One reading failing: the other one decides alone.
  const half = fake({
    checkPhoto: (_photo, i) => (i === 0 ? Promise.reject(new Error("boom")) : Promise.resolve({ ok: true, value: GOOD_PHOTO })),
  });
  assertEquals((await handleStudioTryOn(post(analyseForm()), half.deps)).status, 200);
});
