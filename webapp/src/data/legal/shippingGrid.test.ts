import { describe, expect, it } from "vitest";
import { SHIPPING } from "./shipping";
import { destinationsText, freeShippingText, shippingTableRows, withShippingGrid, type ShippingGridRate, type ShippingGridZone } from "./shippingGrid";

const rate = (over: Partial<ShippingGridRate>): ShippingGridRate => ({
  kind: "standard",
  min_days: 2,
  max_days: 4,
  price: "4.90",
  currency: "EUR",
  free_over_amount: null,
  min_order_amount: null,
  min_weight_grams: null,
  max_weight_grams: null,
  position: 1,
  ...over,
});

const zones: ShippingGridZone[] = [
  {
    name: "Union européenne",
    position: 2,
    is_rest_of_world: false,
    countries: ["DE", "BE"],
    rates: [rate({ price: 8.9, min_days: 3, max_days: 6, free_over_amount: "120" }), rate({ kind: "express", price: 16.9, max_weight_grams: 2000, position: 2 })],
  },
  {
    name: "France",
    position: 1,
    is_rest_of_world: false,
    countries: ["FR", "MC"],
    rates: [rate({ kind: "free", price: 0, min_order_amount: 75, position: 3 }), rate({})],
  },
  { name: "Nowhere", position: 3, is_rest_of_world: false, countries: [], rates: [rate({})] },
];

/** Intl writes narrow no-break spaces in French amounts; compare with plain ones. */
const NO_BREAK_SPACES = new RegExp(`[${String.fromCharCode(0xa0, 0x202f)}]`, "g");
const plain = (text: string | undefined) => text?.replace(NO_BREAK_SPACES, " ");

describe("shipping grid", () => {
  it("lists the served zones in order, with their rates in order", () => {
    const rows = shippingTableRows(zones);
    expect(rows.map((row) => plain(`${row.zone.fr} | ${row.method.fr} | ${row.time.fr} | ${row.cost.fr}`))).toEqual([
      "France | Standard | 2 à 4 jours ouvrés | 4,90 €",
      "France | Livraison offerte | 2 à 4 jours ouvrés | Offerte dès 75 € d’achat",
      "Union européenne | Standard | 3 à 6 jours ouvrés | 8,90 € — offerte dès 120 € d’achat",
      "Union européenne | Express (jusqu’à 2 kg) | 2 à 4 jours ouvrés | 16,90 €",
    ]);
    expect(rows[2]?.zone.en).toBe("European Union");
    expect(rows[2]?.time.en).toBe("3–6 working days");
  });

  it("names every country served and every free-delivery threshold", () => {
    expect(plain(destinationsText(zones).fr)).toContain("France : France, Monaco ; Union européenne : Allemagne, Belgique.");
    expect(plain(freeShippingText(zones)?.en)).toBe(
      "France: free standard delivery from €75 spent; European Union: free standard delivery from €120 spent. The threshold applies to the amount of the products, before discounts.",
    );
  });

  it("keeps the page's own wording without zones", () => {
    expect(withShippingGrid(SHIPPING, null)).toBe(SHIPPING);
    expect(withShippingGrid(SHIPPING, [])).toBe(SHIPPING);
    const table = withShippingGrid(SHIPPING, zones).sections.find((s) => s.id === "methods")?.blocks.find((b) => b.kind === "table");
    expect(table?.kind === "table" && table.rows).toHaveLength(4);
  });
});
