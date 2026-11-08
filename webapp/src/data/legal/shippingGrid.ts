import { toMajorUnits, toMinorUnits } from "../../lib/catalog/money";
import { countryName } from "../../lib/countryName";
import type { Localized } from "../types";
import type { Block, LegalDocument } from "./types";

/**
 * The shipping page's destinations, rate table and free-delivery rules, built
 * from the zones and rates saved in Settings › Shipping (the rows the cart
 * reads, RLS "everyone reads active ones"), so the page and the checkout can
 * never disagree. Without them (mock mode, failed read) the page keeps its
 * generic wording and points to the cart. Pure.
 */

export interface ShippingGridRate {
  kind: string;
  min_days: number;
  max_days: number;
  price: number | string;
  currency: string;
  free_over_amount: number | string | null;
  min_order_amount: number | string | null;
  min_weight_grams: number | null;
  max_weight_grams: number | null;
  position: number;
}

export interface ShippingGridZone {
  name: string;
  position: number;
  is_rest_of_world: boolean;
  countries: string[];
  rates: ShippingGridRate[];
}

const LOCALES = { fr: "fr-FR", en: "en-IE" } as const;
type Lang = keyof typeof LOCALES;

/** English names of the zones as the back office names them (French); anything else keeps its name. */
const ZONE_NAMES_EN: Record<string, string> = {
  France: "France",
  "Union européenne": "European Union",
  Suisse: "Switzerland",
  "Royaume-Uni": "United Kingdom",
  "États-Unis & Canada": "United States & Canada",
  "Reste du monde": "Rest of the world",
};

const KIND_LABELS: Record<string, Localized> = {
  standard: { fr: "Standard", en: "Standard" },
  express: { fr: "Express", en: "Express" },
  free: { fr: "Livraison offerte", en: "Free delivery" },
  pickup: { fr: "Point relais", en: "Pickup point" },
};

/* Formatted here, not with `lib/format` (React and i18next): this module also runs in server pages. */
function money(value: number | string, currency: string, lang: Lang): string {
  const amount = toMajorUnits(toMinorUnits(value));
  const digits = Number.isInteger(amount) ? 0 : 2;
  return new Intl.NumberFormat(LOCALES[lang], { style: "currency", currency, minimumFractionDigits: digits, maximumFractionDigits: 2 }).format(amount);
}
const kg = (grams: number, lang: Lang) => `${new Intl.NumberFormat(LOCALES[lang]).format(grams / 1000)} kg`;

function zoneLabel(zone: ShippingGridZone, lang: Lang): string {
  return lang === "fr" ? zone.name : (ZONE_NAMES_EN[zone.name] ?? zone.name);
}

function countriesOf(zone: ShippingGridZone, lang: Lang): string {
  const names = zone.countries.map((code) => countryName(code, lang)).sort((a, b) => a.localeCompare(b, lang));
  return names.join(", ");
}

function methodLabel(rate: ShippingGridRate, lang: Lang): string {
  const base = KIND_LABELS[rate.kind]?.[lang] ?? rate.kind;
  if (rate.max_weight_grams !== null) return `${base} (${lang === "fr" ? "jusqu’à" : "up to"} ${kg(rate.max_weight_grams, lang)})`;
  if (rate.min_weight_grams !== null) return `${base} (${lang === "fr" ? "plus de" : "over"} ${kg(rate.min_weight_grams, lang)})`;
  return base;
}

function timeLabel(rate: ShippingGridRate, lang: Lang): string {
  const span = rate.min_days === rate.max_days ? `${rate.max_days}` : lang === "fr" ? `${rate.min_days} à ${rate.max_days}` : `${rate.min_days}–${rate.max_days}`;
  return lang === "fr" ? `${span} jours ouvrés` : `${span} working days`;
}

function costLabel(rate: ShippingGridRate, lang: Lang): string {
  if (rate.kind === "free") {
    return rate.min_order_amount === null
      ? lang === "fr" ? "Offerte" : "Free"
      : lang === "fr" ? `Offerte dès ${money(rate.min_order_amount, rate.currency, lang)} d’achat` : `Free from ${money(rate.min_order_amount, rate.currency, lang)} spent`;
  }
  const price = money(rate.price, rate.currency, lang);
  if (rate.free_over_amount === null) return price;
  const over = money(rate.free_over_amount, rate.currency, lang);
  return lang === "fr" ? `${price} — offerte dès ${over} d’achat` : `${price} — free from ${over} spent`;
}

const both = (fn: (lang: Lang) => string): Localized => ({ fr: fn("fr"), en: fn("en") });

/** Zones that actually take orders, in the back office's order, with their rates in order. */
function served(zones: ShippingGridZone[]): ShippingGridZone[] {
  return zones
    .filter((zone) => zone.rates.length > 0 && (zone.countries.length > 0 || zone.is_rest_of_world))
    .map((zone) => ({ ...zone, rates: [...zone.rates].sort((a, b) => a.position - b.position) }))
    .sort((a, b) => a.position - b.position);
}

export function shippingTableRows(zones: ShippingGridZone[]): Record<string, Localized>[] {
  return served(zones).flatMap((zone) =>
    zone.rates.map((rate) => ({
      zone: both((lang) => zoneLabel(zone, lang)),
      method: both((lang) => methodLabel(rate, lang)),
      time: both((lang) => timeLabel(rate, lang)),
      cost: both((lang) => costLabel(rate, lang)),
    })),
  );
}

export function destinationsText(zones: ShippingGridZone[]): Localized {
  const list = served(zones);
  const worldwide = list.some((zone) => zone.is_rest_of_world);
  const lines = (lang: Lang) =>
    list
      .filter((zone) => !zone.is_rest_of_world)
      .map((zone) => `${zoneLabel(zone, lang)}${lang === "fr" ? " : " : ": "}${countriesOf(zone, lang)}`)
      .join(" ; ");
  return both((lang) =>
    lang === "fr"
      ? `Nous livrons dans les zones suivantes — ${lines(lang)}${worldwide ? " ; et le reste du monde" : ""}. Si votre pays n’apparaît pas lors du paiement, contactez-nous avant de commander.`
      : `We deliver to the following zones — ${lines(lang)}${worldwide ? "; and the rest of the world" : ""}. If your country does not appear at checkout, contact us before ordering.`,
  );
}

export function freeShippingText(zones: ShippingGridZone[]): Localized | null {
  const offers = served(zones).flatMap((zone) =>
    zone.rates
      .map((rate) => {
        const threshold = rate.kind === "free" ? rate.min_order_amount : rate.free_over_amount;
        return threshold === null ? null : { zone, rate, threshold };
      })
      .filter((offer) => offer !== null),
  );
  if (offers.length === 0) return null;
  return both((lang) => {
    const items = offers.map(({ zone, rate, threshold }) =>
      lang === "fr"
        ? `${zoneLabel(zone, lang)} : livraison ${rate.kind === "free" ? "standard" : (KIND_LABELS[rate.kind]?.fr ?? rate.kind).toLowerCase()} offerte dès ${money(threshold, rate.currency, lang)} d’achat`
        : `${zoneLabel(zone, lang)}: free ${rate.kind === "free" ? "standard" : (KIND_LABELS[rate.kind]?.en ?? rate.kind).toLowerCase()} delivery from ${money(threshold, rate.currency, lang)} spent`,
    );
    return lang === "fr"
      ? `${items.join(" ; ")}. Le seuil s’applique au montant des produits, avant réductions.`
      : `${items.join("; ")}. The threshold applies to the amount of the products, before discounts.`;
  });
}

/** The shipping page with the live grid in place of its generic table; unchanged without zones. */
export function withShippingGrid(doc: LegalDocument, zones: ShippingGridZone[] | null): LegalDocument {
  if (!zones || served(zones).length === 0) return doc;
  const rows = shippingTableRows(zones);
  const destinations = destinationsText(zones);
  const free = freeShippingText(zones);
  const sections = doc.sections.map((section) => {
    const blocks: Block[] = section.blocks.map((block) => {
      if (section.id === "destinations" && block.kind === "p") return { ...block, text: destinations };
      if (section.id === "methods" && block.kind === "table") return { ...block, rows };
      if (section.id === "free-shipping" && block.kind === "callout" && free) return { ...block, text: free };
      return block;
    });
    return { ...section, blocks };
  });
  return { ...doc, sections };
}
