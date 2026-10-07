import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlacedJewelry } from "../../data/studioEditor";
import { DesignStore } from "../studio3d/store";
import { createScene } from "./scene";
import {
  decodeSharedDesign,
  encodeSharedDesign,
  parseSharedCreation,
  SHARE_JSON_MAX_BYTES,
  SHARE_TOKEN_MAX_CHARS,
  SHARE_TOKEN_PATTERN,
  snapshotShareLink,
  storedShareLink,
} from "./share";

const piece = (over: Partial<PlacedJewelry> = {}): PlacedJewelry => ({
  id: "a",
  productId: "solitaire",
  ss: 5,
  look: { shape: "round", material: "crystal", color: "#ffffff", effect: "none" },
  toothId: "11",
  position: { x: -4.123456789, y: 0.5, z: 3 },
  normal: { x: -0.2, y: 0, z: 0.98 },
  rotation: 12.5,
  scale: 0.9,
  ...over,
});

const scene = createScene({
  pieces: [piece(), piece({
      id: "b",
      productId: "etoile",
      variantId: "white-gold",
      look: { shape: "halo-star", material: "metal", color: "#e3e6ea", effect: "none" },
      toothId: "21",
      position: { x: 4, y: 0.5, z: 3 },
    })],
  groups: [{ id: "g1", gemGroupId: "grp", name: "Pair", pieceIds: ["a", "b"] }],
  lightPreset: "lamp",
  camera: { position: [0, 9, 66], target: [0, 0.5, -6] },
});

const bytesToB64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64url = (text: string) => bytesToB64url(new TextEncoder().encode(text));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("share links", () => {
  it("round-trips a design through the compressed fragment", async () => {
    const token = await encodeSharedDesign({ name: "  Crystal Smile ", description: "Two crystals", scene });
    expect(token.startsWith("z1.")).toBe(true);
    expect(token).toMatch(/^z1\.[A-Za-z0-9_-]+$/);
    const back = await decodeSharedDesign(`#${token}`);
    expect(back?.name).toBe("Crystal Smile");
    expect(back?.description).toBe("Two crystals");
    expect(back?.scene.lightPreset).toBe("lamp");
    expect(back?.scene.camera).toEqual(scene.camera);
    expect(back?.scene.groups).toEqual([{ id: "g1", gemGroupId: null, name: "Pair", pieceIds: ["a", "b"] }]);
    expect(back?.scene.pieces.map((p) => p.id)).toEqual(["a", "b"]);
    expect(back?.scene.pieces[1]).toMatchObject({ productId: "etoile", variantId: "white-gold", ss: 5, look: { shape: "halo-star", material: "metal" } });
    // Rounded to a ten-thousandth of a millimetre to keep the link short.
    expect(back?.scene.pieces[0].position.x).toBe(-4.1235);
  });

  it("falls back to plain JSON where CompressionStream is missing", async () => {
    vi.stubGlobal("CompressionStream", undefined);
    const token = await encodeSharedDesign({ name: "Plain", description: "", scene });
    expect(token.startsWith("j1.")).toBe(true);
    vi.unstubAllGlobals();
    expect((await decodeSharedDesign(token))?.name).toBe("Plain");
  });

  it("carries only what the viewer needs", async () => {
    const withExtras = { ...scene, ownerId: "user-123", clientName: "Jane Doe" } as unknown as typeof scene;
    // The plain form, so the link's own bytes can be read back.
    vi.stubGlobal("CompressionStream", undefined);
    const token = await encodeSharedDesign({ name: "N", description: "", scene: withExtras });
    const raw = new TextDecoder().decode(Uint8Array.from(atob(token.slice(3).replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)));
    expect(raw).toContain('"pieces"');
    for (const secret of ["user-123", "Jane Doe", "ownerId", "clientName", "grp"]) expect(raw).not.toContain(secret);
  });

  it("refuses empty, unknown, truncated or tampered links", async () => {
    const token = await encodeSharedDesign({ name: "N", description: "", scene });
    expect(await decodeSharedDesign("")).toBeNull();
    expect(await decodeSharedDesign("#")).toBeNull();
    expect(await decodeSharedDesign("x1.abc")).toBeNull();
    expect(await decodeSharedDesign(token.slice(0, token.length - 12))).toBeNull();
    expect(await decodeSharedDesign("z1.not*base64")).toBeNull();
    expect(await decodeSharedDesign(`j1.${b64url("{not json")}`)).toBeNull();
    expect(await decodeSharedDesign(`j1.${b64url(JSON.stringify({ v: 2, name: "N", scene }))}`)).toBeNull();
    expect(await decodeSharedDesign(`j1.${b64url(JSON.stringify({ v: 1, name: "N", scene: { ...scene, version: 9 } }))}`)).toBeNull();
  });

  it("sanitizes what a hand-made link carries", async () => {
    const forged = {
      v: 1,
      name: "x".repeat(500),
      description: 42,
      scene: {
        version: 2,
        model: "evil",
        lightPreset: "lamp",
        camera: { position: [0, "a", 1], target: [0, 0, 0] },
        pieces: [piece(), { id: "bad", productId: "x", ss: 5, look: { shape: "hexagon", color: "#fff" }, toothId: "11", position: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 1 } }],
        groups: [],
      },
    };
    const back = await decodeSharedDesign(`j1.${b64url(JSON.stringify(forged))}`);
    expect(back?.name.length).toBe(60);
    expect(back?.description).toBe("");
    expect(back?.scene.model).toBe("studio");
    expect(back?.scene.camera).toBeNull();
    expect(back?.scene.pieces.map((p) => p.id)).toEqual(["a"]);
  });

  it("refuses oversized links, before and after decompression", async () => {
    expect(await decodeSharedDesign(`j1.${"A".repeat(SHARE_TOKEN_MAX_CHARS)}`)).toBeNull();
    // A small link that inflates past the cap (a "zip bomb") is stopped while inflating.
    const huge = new TextEncoder().encode(JSON.stringify({ v: 1, name: "N", description: " ".repeat(SHARE_JSON_MAX_BYTES), scene }));
    const stream = new Blob([huge]).stream().pipeThrough(new CompressionStream("deflate-raw"));
    const packed = new Uint8Array(await new Response(stream).arrayBuffer());
    const token = `z1.${bytesToB64url(packed)}`;
    expect(token.length).toBeLessThan(SHARE_TOKEN_MAX_CHARS);
    expect(await decodeSharedDesign(token)).toBeNull();
  });
});

describe("a store for viewing only", () => {
  it("never reads nor writes the browser's draft", () => {
    const getItem = vi.fn(() => null);
    const setItem = vi.fn();
    vi.stubGlobal("localStorage", { getItem, setItem, removeItem: vi.fn() });
    vi.useFakeTimers();
    try {
      const store = new DesignStore({ persist: false });
      store.loadScene(scene, null);
      store.saveNow();
      vi.runAllTimers();
      expect(store.jewels).toHaveLength(2);
      expect(getItem).not.toHaveBeenCalled();
      expect(setItem).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("stored share links", () => {
  const token = "0123456789abcdef".repeat(3);

  it("points a live, revocable link at the token", () => {
    expect(SHARE_TOKEN_PATTERN.test(token)).toBe(true);
    expect(storedShareLink(token, "/studio-3d/partage", "https://example.test")).toEqual({
      url: `https://example.test/studio-3d/partage/${token}`,
      live: true,
      revocable: true,
    });
  });

  it("accepts only the 48-hex tokens the database mints", () => {
    for (const bad of ["", token.slice(1), `${token}0`, token.toUpperCase(), `${token.slice(0, 47)}g`, "../../creations"]) {
      expect(SHARE_TOKEN_PATTERN.test(bad)).toBe(false);
    }
  });

  it("keeps snapshot links neither live nor revocable", async () => {
    const link = await snapshotShareLink({ name: "Pair", description: "", scene }, "/studio-3d/partage", "https://example.test");
    expect(link.live).toBe(false);
    expect(link.revocable).toBe(false);
    expect(link.url.startsWith("https://example.test/studio-3d/partage#")).toBe(true);
  });

  it("reads the shared creation defensively", () => {
    const back = parseSharedCreation({ name: "  Crystal \n Smile ", description: " Two ", scene_data: scene, updated_at: "2026-09-29" });
    expect(back?.name).toBe("Crystal Smile");
    expect(back?.description).toBe("Two");
    expect(back?.scene.pieces).toHaveLength(2);
    expect(parseSharedCreation({ name: "x".repeat(500), description: "", scene_data: scene })?.name.length).toBeLessThanOrEqual(60);
  });

  it("refuses rows that are missing or from an unknown scene version", () => {
    expect(parseSharedCreation(null)).toBeNull();
    expect(parseSharedCreation(undefined)).toBeNull();
    expect(parseSharedCreation({ name: "x", scene_data: null })).toBeNull();
    expect(parseSharedCreation({ name: "x", scene_data: { ...scene, version: 99 } })).toBeNull();
  });
});
