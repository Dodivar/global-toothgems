import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { designGems, gemPhotosText, gemWords, pickMedia, type MediaRow } from "./gems.ts";

const P1 = "0d73ff19-1bef-44c0-a745-c7e3d2c1be5a";
const P2 = "f9b64149-6aa7-4539-886b-a611dcfc5b0c";
const V2 = "0c9f90af-0883-4028-b57d-ca12b6a3ef07";
const crystal = { shape: "raindrop", material: "crystal", color: "#F1F3FF", effect: "iridescent" };
const gold = { shape: "cherries", material: "metal", color: "#f2c25c", effect: "none" };

Deno.test("designGems: one entry per product and variant, the most used first; malformed pieces skipped", () => {
  const gems = designGems({
    pieces: [
      { productId: P2, variantId: V2, look: gold },
      { productId: P1, look: crystal },
      { productId: P1, look: crystal },
      { productId: "not-a-uuid", look: crystal },
      "nonsense",
    ],
  });
  assertEquals(gems.map((g) => [g.productId, g.variantId, g.count]), [
    [P1, null, 2],
    [P2, V2, 1],
  ]);
  assertEquals(gems[0].color, "#f1f3ff");
  assertEquals(gems[0].iridescent, true);
  assertEquals(gems[1].material, "metal");
  assertEquals(designGems(null), []);
  assertEquals(designGems({ pieces: Array.from({ length: 9 }, () => ({ productId: crypto.randomUUID(), look: crystal })) }).length, 6);
});

Deno.test("pickMedia: the variant's primary, else the product's primary, else its first image", () => {
  const rows: MediaRow[] = [
    { product_id: P2, variant_id: null, storage_path: "p2/product.webp", is_primary: true, position: 0 },
    { product_id: P2, variant_id: V2, storage_path: "p2/variant-2.webp", is_primary: false, position: 1 },
    { product_id: P2, variant_id: V2, storage_path: "p2/variant-1.webp", is_primary: true, position: 0 },
    { product_id: P1, variant_id: null, storage_path: "p1/second.jpg", is_primary: false, position: 1 },
    { product_id: P1, variant_id: null, storage_path: "p1/first.png", is_primary: false, position: 0 },
    { product_id: P1, variant_id: null, storage_path: "p1/video.mp4", is_primary: true, position: 0 },
  ];
  assertEquals(pickMedia(rows, { productId: P2, variantId: V2 }), "p2/variant-1.webp");
  assertEquals(pickMedia(rows, { productId: P2, variantId: null }), "p2/product.webp");
  assertEquals(pickMedia(rows, { productId: P1, variantId: null }), "p1/first.png");
  assertEquals(pickMedia(rows, { productId: crypto.randomUUID(), variantId: null }), null);
});

Deno.test("gem words and the photos' text: what each gem is, in the photos' order", () => {
  const [drop, cherries] = designGems({ pieces: [{ productId: P1, look: crystal }, { productId: P1, look: crystal }, { productId: P2, look: gold }] });
  assertEquals(gemWords(drop), "a faceted crystal, teardrop cut, with an iridescent AB coating");
  assertEquals(gemWords(cherries), "a polished solid 18k yellow gold charm (cherries)");
  assertEquals(gemWords({ ...cherries, color: "#e3e6ea" }), "a polished solid 18k white gold charm (cherries)");
  const text = gemPhotosText([
    { gem: drop, name: "SWAROVSKI® Raindrop - Crystal AB" },
    { gem: cherries, name: "Cerises en or 18 carats <script>" },
  ])!;
  assertStringIncludes(text, "GEM PHOTO 1: SWAROVSKI® Raindrop - Crystal AB — a faceted crystal, teardrop cut, with an iridescent AB coating; 2 marks in IMAGE 1.");
  assertStringIncludes(text, "GEM PHOTO 2: Cerises en or 18 carats script — a polished solid 18k yellow gold charm (cherries); 1 mark in IMAGE 1.");
  assertEquals(gemPhotosText([]), null);
});
