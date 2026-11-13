import { describe, expect, it } from "vitest";
import type { CartLine } from "./checkout/cartLines";
import { pixelBasket, pixelContentId } from "./metaPixel";
import { pixelAllowedPath } from "./metaPixelConfig";

const line = (overrides: Partial<CartLine>): CartLine => ({
  id: "x",
  productId: "coeur",
  name: "Cœur",
  image: "",
  unitPrice: 1990,
  currency: "EUR",
  qty: 1,
  ...overrides,
});

describe("pixelBasket", () => {
  it("uses the feeds' ids, leaves courses and gift cards out of them, and counts the value", () => {
    const basket = pixelBasket([
      line({ dbProductId: "p1", variantId: "v1", qty: 2 }),
      line({ dbProductId: "p2", unitPrice: 4500 }),
      line({ courseId: "c1", productId: "masterclass", unitPrice: 30000 }),
      line({ giftCard: { amount: 50, design: "x" } as unknown as CartLine["giftCard"], productId: "gift", unitPrice: 5000 }),
      line({ productId: "mock-only" }),
    ]);
    expect(basket).toEqual({
      content_type: "product",
      content_ids: ["v1", "p2"],
      contents: [
        { id: "v1", quantity: 2 },
        { id: "p2", quantity: 1 },
      ],
      num_items: 6,
      value: 454.7,
      currency: "EUR",
    });
  });

  it("names an item by its variant, else its product", () => {
    expect(pixelContentId({ variantId: "v", dbProductId: "p" })).toBe("v");
    expect(pixelContentId({ dbProductId: "p" })).toBe("p");
    expect(pixelContentId({})).toBeUndefined();
  });
});

describe("pixelAllowedPath", () => {
  it("allows the storefront only, never private zones or the guest withdrawal page", () => {
    expect(pixelAllowedPath("/fr/boutique/coeur")).toBe(true);
    expect(pixelAllowedPath("/en")).toBe(true);
    expect(pixelAllowedPath("/fr/panier/confirmation?session_id=cs_1")).toBe(true);
    expect(pixelAllowedPath("/compte/commandes")).toBe(false);
    expect(pixelAllowedPath("/admin")).toBe(false);
    expect(pixelAllowedPath("/connexion")).toBe(false);
    expect(pixelAllowedPath("/studio-3d/atelier")).toBe(false);
    expect(pixelAllowedPath("/academy/lecon/x")).toBe(false);
    expect(pixelAllowedPath("/fr/retours-remboursements/retractation")).toBe(false);
    expect(pixelAllowedPath("/en/returns/withdrawal")).toBe(false);
    expect(pixelAllowedPath("/french")).toBe(false);
  });

  it("allows the shop's pages only, not the Studio, Glowbook, Academy, help or legal pages", () => {
    for (const path of ["/fr", "/en/shop", "/fr/formes", "/en/colours", "/en/cart", "/fr/carte-cadeau", "/en/loyalty"]) {
      expect(pixelAllowedPath(path)).toBe(true);
    }
    for (const path of [
      "/fr/studio-3d",
      "/en/3d-studio/subscribe",
      "/fr/glowbook",
      "/en/glowbook/some-artist",
      "/fr/academy",
      "/en/academy/course/masterclass",
      "/fr/aide/faq",
      "/en/contact",
      "/fr/cookies",
      "/en/terms-of-sale",
      "/fr/livraison",
      "/en/returns",
      "/fr/inconnu",
    ]) {
      expect(pixelAllowedPath(path)).toBe(false);
    }
  });
});
