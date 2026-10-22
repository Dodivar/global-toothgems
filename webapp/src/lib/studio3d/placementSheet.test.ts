import { describe, expect, it } from "vitest";
import { scaleForSize, type PlacedJewelry } from "../../data/studioEditor";
import { DENTITION_CROWNS } from "./dentition";
import { projectFrontView } from "./frontView";
import { buildPlacementSheet, fitText, placementSheetFileName, referenceGroups, toothCell, type PlacementSheetInput } from "./placementSheet";

function piece(id: string, fdi: string, extra: Partial<PlacedJewelry> = {}): PlacedJewelry {
  const c = DENTITION_CROWNS.find((x) => x.fdi === fdi)!;
  return {
    id,
    productId: "gem-a",
    size: { ss: 5 },
    look: { shape: "heart", material: "crystal", color: "#e0479b", effect: "none" },
    toothId: fdi,
    position: { x: c.center.x + c.outward.x * c.halfDepth, y: c.center.y, z: c.center.z + c.outward.z * c.halfDepth },
    normal: { ...c.outward },
    rotation: 15,
    scale: scaleForSize({ ss: 5 }),
    ...extra,
  };
}

function input(pieces: PlacedJewelry[]): PlacementSheetInput {
  const projection = projectFrontView(pieces, "dentition");
  return {
    projection,
    name: "Sourire étoilé",
    date: "18 octobre 2026",
    lang: "fr",
    rows: projection.gems.map((g) => ({ number: g.number, order: g.order, tooth: g.toothId, shape: "Cœur", size: "SS5", colour: "Rose" })),
    totals: referenceGroups(projection).map((r) => ({
      reference: r.productId,
      colour: "Rose",
      size: `SS${r.size.ss}`,
      count: r.numbers.length,
      numbers: r.numbers.join(", "),
      toBuy: "1 × 20",
    })),
    labels: {
      title: "Fiche de pose",
      subtitle: "2 gemmes",
      figure: "Vue de face",
      patientRight: "Droite du patient",
      patientLeft: "Gauche du patient",
      unplacedNote: null,
      gemsTitle: "Gemmes",
      number: "N°",
      tooth: "Dent",
      shape: "Forme",
      size: "Taille",
      colour: "Couleur",
      order: "Ordre",
      totalsTitle: "Par référence",
      reference: "Référence",
      count: "Qté",
      numbers: "Numéros",
      toBuy: "À prévoir",
      footer: "Schéma indicatif",
      page: (p, n) => `Page ${p} / ${n}`,
      author: "Global Toothgems",
    },
  };
}

const latin1 = (bytes: Uint8Array) => Array.from(bytes, (b) => String.fromCharCode(b)).join("");

describe("placement sheet", () => {
  it("writes a one-page PDF with the drawing, the gems and the totals", () => {
    const pdf = latin1(buildPlacementSheet(input([piece("a", "11"), piece("b", "21", { variantId: "v-2" })]), new Date("2026-10-18T10:00:00Z")));
    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf).toContain("/Count 1");
    expect(pdf).toContain("(FICHE DE POSE) Tj");
    expect(pdf).toContain("(Page 1 / 1) Tj");
    // Gems are drawn as filled and stroked paths in their colour.
    expect(pdf).toContain("0.88 0.28 0.61 rg");
    expect(pdf.trimEnd().endsWith("%%EOF")).toBe(true);
  });

  it("flows a long design over several pages", () => {
    const many = Array.from({ length: 80 }, (_, i) => piece(`p${i}`, ["11", "21", "12", "22"][i % 4]));
    const pdf = latin1(buildPlacementSheet(input(many)));
    expect(pdf).toMatch(/\/Count [2-9]/);
    expect(pdf).toContain("(Page 2 / ");
  });

  it("groups gems per product, colour and size, keeping their numbers", () => {
    const view = projectFrontView([piece("a", "11"), piece("b", "21"), piece("c", "12", { size: { ss: 7 } })], "dentition");
    const groups = referenceGroups(view);
    expect(groups).toHaveLength(2);
    expect(groups.find((g) => g.size.ss === 5)!.numbers).toEqual([2, 3]);
    expect(groups.find((g) => g.size.ss === 7)!.numbers).toEqual([1]);
  });

  it("always prints a gem's note whole, shortening the tooth name instead", () => {
    const cell = toothCell({ tooth: "11 · Incisive centrale · haut droite et encore plus long", note: "face arrière" }, 160);
    expect(cell.endsWith(" (face arrière)")).toBe(true);
    expect(cell).toContain("…");
    expect(fitText(cell, "regular", 8.2, 160)).toBe(cell);
    expect(toothCell({ tooth: "11" }, 160)).toBe("11");
  });

  it("shortens text to a width and names the file in ASCII", () => {
    expect(fitText("a very long tooth name indeed", "regular", 8, 40).endsWith("…")).toBe(true);
    expect(fitText("short", "regular", 8, 400)).toBe("short");
    expect(placementSheetFileName("Fiche de pose", "Sourire étoilé", new Date("2026-10-18T10:00:00Z"))).toBe(
      "fiche-de-pose-sourire-etoile-2026-10-18.pdf",
    );
  });
});
