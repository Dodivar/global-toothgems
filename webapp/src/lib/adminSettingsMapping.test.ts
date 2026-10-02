import { describe, expect, it } from "vitest";
import type { ShippingZone, StoreDetails, TaxSettings } from "../data/adminSettings";
import {
  centsToAmount,
  languagesPayload,
  mapLanguages,
  mapShippingZones,
  mapTaxSettings,
  settingsWriteErrorOf,
  shippingPayload,
  taxPayload,
  type ShippingZoneRow,
  type TaxRateRow,
} from "./adminSettingsMapping";
import { inVatArea, servedWithoutVat, validateStore, vatRateFor } from "./settingsRules";
import { addressLines, hoursSummary, mapStoreDetails, parseOpeningHours, storeDetailsPayload, type StoreSettingsRow } from "./storeDetails";

/**
 * What a payload becomes once the database has stored it and PostgREST reads
 * it back: positions from the array order (counting from 1, as
 * admin_save_shipping does), amounts as numbers, countries in any order.
 */
function storedShipping(payload: ReturnType<typeof shippingPayload>): ShippingZoneRow[] {
  return payload
    .map((z, zi) => ({
      id: z.id,
      name: z.name,
      is_rest_of_world: z.is_rest_of_world,
      is_active: z.is_active,
      position: zi + 1,
      shipping_zone_countries: [...z.countries].reverse().map((country_code) => ({ country_code })),
      shipping_rates: z.rates
        .map((r, ri) => ({
          ...r,
          price: Number(r.price),
          free_over_amount: r.free_over_amount == null ? null : Number(r.free_over_amount),
          min_order_amount: r.min_order_amount,
          max_order_amount: r.max_order_amount == null ? null : Number(r.max_order_amount),
          position: ri + 1,
        }))
        .reverse(),
    }))
    .reverse();
}

const ZONES: ShippingZone[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    name: "France",
    countries: ["FR", "MC"],
    restOfWorld: false,
    active: true,
    rates: [
      {
        id: "21111111-1111-4111-8111-111111111111",
        kind: "standard",
        name: "Livraison standard",
        minDays: 2,
        maxDays: 4,
        priceCents: 490,
        freeOverCents: 7500,
        minOrderCents: null,
        maxOrderCents: null,
        minWeightG: null,
        maxWeightG: 2000,
        active: true,
      },
      {
        id: "31111111-1111-4111-8111-111111111111",
        kind: "free",
        name: "Livraison offerte",
        minDays: 2,
        maxDays: 4,
        priceCents: 0,
        freeOverCents: null,
        minOrderCents: 7500,
        maxOrderCents: 100001,
        minWeightG: null,
        maxWeightG: null,
        active: false,
      },
    ],
  },
  { id: "41111111-1111-4111-8111-111111111111", name: "Reste du monde", countries: [], restOfWorld: true, active: false, rates: [] },
];

describe("money", () => {
  it("writes cents as a two-decimal amount without float arithmetic", () => {
    expect(centsToAmount(0)).toBe("0.00");
    expect(centsToAmount(5)).toBe("0.05");
    expect(centsToAmount(490)).toBe("4.90");
    expect(centsToAmount(1999)).toBe("19.99");
    expect(centsToAmount(100001)).toBe("1000.01");
    expect(() => centsToAmount(4.5)).toThrow();
    expect(() => centsToAmount(-1)).toThrow();
  });
});

describe("shipping", () => {
  it("reads back exactly what it saved (no spurious unsaved changes)", () => {
    const payload = shippingPayload(ZONES);
    expect(mapShippingZones(storedShipping(payload))).toEqual(ZONES);
  });

  it("sends amounts as decimal strings and no country on the catch-all zone", () => {
    const [france, world] = shippingPayload([...ZONES.slice(0, 1), { ...ZONES[1], countries: ["JP"] }]);
    expect(france.rates[0]).toMatchObject({ price: "4.90", free_over_amount: "75.00", min_order_amount: null, max_weight_grams: 2000 });
    expect(france.countries).toEqual(["FR", "MC"]);
    expect(world.countries).toEqual([]);
  });

  it("reads amounts sent as strings too", () => {
    const [zone] = mapShippingZones([
      {
        id: "z",
        name: "Z",
        is_rest_of_world: false,
        is_active: true,
        position: 1,
        shipping_zone_countries: [{ country_code: "DE" }],
        shipping_rates: [
          {
            id: "r",
            kind: "express",
            name: "Express",
            min_days: 1,
            max_days: 2,
            price: "16.90",
            free_over_amount: null,
            min_order_amount: "0",
            max_order_amount: null,
            min_weight_grams: null,
            max_weight_grams: null,
            is_active: true,
            position: 1,
          },
        ],
      },
    ]);
    expect(zone.rates[0]).toMatchObject({ priceCents: 1690, minOrderCents: 0 });
  });
});

describe("VAT", () => {
  const rows: TaxRateRow[] = [
    { country_code: "IT", tax_category: "standard", rate_bp: 2200, is_active: true },
    { country_code: "FR", tax_category: "books", rate_bp: 550, is_active: true },
    { country_code: "FR", tax_category: "standard", rate_bp: 2000, is_active: true },
    { country_code: "DE", tax_category: "standard", rate_bp: 1900, is_active: false },
  ];

  it("splits standard and reduced rates and round-trips", () => {
    const settings = mapTaxSettings(rows);
    expect(settings.rates.map((r) => r.country)).toEqual(["DE", "FR", "IT"]);
    expect(settings.reduced).toEqual([{ country: "FR", category: "books", rateBp: 550, active: true }]);
    expect(mapTaxSettings(taxPayload(settings))).toEqual(settings);
  });

  it("applies the country's active rate, else none — like vat_rate_bp()", () => {
    const settings = mapTaxSettings(rows);
    expect(vatRateFor("FR", settings)).toEqual({ bp: 2000, source: "country" });
    expect(vatRateFor("DE", settings)).toEqual({ bp: 0, source: "none" });
    expect(vatRateFor("US", settings)).toEqual({ bp: 0, source: "none" });
    expect(inVatArea("MC")).toBe(true);
    expect(inVatArea("CH")).toBe(false);
  });

  it("lists served EU countries that would pay no VAT", () => {
    const taxes: TaxSettings = { rates: [{ country: "FR", standardBp: 2000, active: true }], reduced: [] };
    const zones: ShippingZone[] = [
      { ...ZONES[0], countries: ["FR", "MC", "CH"] },
      { ...ZONES[0], id: "z2", name: "Paused", active: false, countries: ["PL"] },
    ];
    expect(servedWithoutVat(zones, taxes)).toEqual(["MC"]);
  });
});

describe("languages", () => {
  it("orders by position and sends only the switch", () => {
    const settings = mapLanguages([
      { code: "en", locale: "en-GB", native_name: "English", is_default: false, is_enabled: true, position: 2 },
      { code: "fr", locale: "fr-FR", native_name: "Français", is_default: true, is_enabled: true, position: 1 },
    ]);
    expect(settings.languages.map((l) => l.code)).toEqual(["fr", "en"]);
    expect(languagesPayload(settings)).toEqual([
      { code: "fr", is_enabled: true },
      { code: "en", is_enabled: true },
    ]);
  });
});

describe("store details", () => {
  const row: StoreSettingsRow = {
    store_name: "Global Toothgems",
    legal_name: "Global Toothgems SAS",
    legal_form: "SAS",
    share_capital: null,
    registration_number: "RCS Paris 123 456 789",
    vat_number: "FR12345678901",
    business_email: null,
    support_email: "support@example.com",
    phone: "+33 1 23 45 67 89",
    address_line1: "1 rue Fictive",
    address_line2: null,
    postal_code: "75004",
    city: "Paris",
    region: null,
    country_code: "FR",
    publication_director: null,
    publication_director_role: null,
    host_name: null,
    host_address: null,
    host_contact: null,
    show_email: true,
    show_phone: false,
    show_address: false,
    opening_hours: {
      mon: { open: true, from: "09:30", to: "18:00" },
      tue: { open: true, from: "09:30", to: "18:00" },
      wed: { open: true, from: "09:30", to: "18:00" },
      thu: { open: true, from: "18:00", to: "09:00" },
      fri: { open: true, from: "9h", to: "17:00" },
      sat: { open: false, from: "10:00", to: "13:00" },
    },
    support_message: "Réponse sous un jour ouvré.",
  };

  it("maps nulls to empty fields and reads the English message from its translation", () => {
    const d = mapStoreDetails(row, [{ locale: "en", support_message: "One business day." }]);
    expect(d).toMatchObject({ businessEmail: "", region: "", supportMessage: { fr: "Réponse sous un jour ouvré.", en: "One business day." } });
  });

  it("reads a malformed or missing day as closed", () => {
    const hours = parseOpeningHours(row.opening_hours);
    expect(hours.thu.open).toBe(false);
    expect(hours.fri).toEqual({ open: false, from: "09:00", to: "17:00" });
    expect(hours.sun).toEqual({ open: false, from: "09:00", to: "18:00" });
  });

  it("round-trips through the save payload", () => {
    const d = mapStoreDetails(row, []);
    const p = storeDetailsPayload({ ...d, vatNumber: "fr 12 345678901" });
    expect(p.vat_number).toBe("FR12345678901");
    expect(p.translations).toEqual({ en: { support_message: "" } });
    const stored = { ...row, ...Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v === "" ? null : v])) } as unknown as StoreSettingsRow;
    expect(mapStoreDetails(stored, [])).toEqual(d);
  });

  it("validates what the database checks", () => {
    const d: StoreDetails = mapStoreDetails(row, []);
    expect(validateStore(d)).toEqual({});
    expect(validateStore({ ...d, supportEmail: "nope", vatNumber: "123", showPhone: true, phone: "" })).toEqual({
      supportEmail: "email",
      vatNumber: "vatNumber",
      phone: "requiredShown",
    });
    expect(validateStore({ ...d, hours: { ...d.hours, mon: { open: true, from: "18:00", to: "09:00" } } }).hours).toBe("hours");
  });

  it("summarises the week and the address for the contact page", () => {
    const d = mapStoreDetails(row, []);
    expect(hoursSummary(d.hours, "fr", "Fermé")).toEqual(["lun. – mer. · 09:30 – 18:00", "jeu. – dim. · Fermé"]);
    expect(addressLines({ ...d, address2: "Bât. B", region: "IDF" })).toEqual(["1 rue Fictive, Bât. B", "75004 Paris, IDF"]);
  });
});

describe("errors", () => {
  it("words refusals without exposing the database", () => {
    expect(settingsWriteErrorOf({ code: "42501" })).toBe("forbidden");
    expect(settingsWriteErrorOf({ code: "22023" })).toBe("invalid");
    expect(settingsWriteErrorOf({ code: "23514" })).toBe("invalid");
    expect(settingsWriteErrorOf({ code: "PGRST301" })).toBe("unavailable");
    expect(settingsWriteErrorOf(null)).toBe("unavailable");
  });
});

describe("legal notice", () => {
  it("publishes the saved details and keeps placeholders for the rest", async () => {
    const { legalNotice } = await import("../data/legal/legalNotice");
    const store: StoreDetails = {
      ...mapStoreDetails(
        {
          store_name: "Global Toothgems",
          legal_name: "Global Toothgems SAS",
          legal_form: "SAS",
          share_capital: "10 000 €",
          registration_number: null,
          vat_number: "FR12345678901",
          business_email: null,
          support_email: "support@example.com",
          phone: "+33 1 23 45 67 89",
          address_line1: "1 rue Fictive",
          address_line2: null,
          postal_code: "75004",
          city: "Paris",
          region: null,
          country_code: "FR",
          publication_director: "Ada Test",
          publication_director_role: null,
          host_name: "Vercel Inc.",
          host_address: null,
          host_contact: null,
          show_email: true,
          show_phone: false,
          show_address: false,
          opening_hours: {},
          support_message: null,
        },
        [],
      ),
    };
    const doc = legalNotice(store);
    const fields = doc.sections.flatMap((s) => s.blocks).flatMap((b) => (b.kind === "fields" ? b.fields : []));
    const valueOf = (fr: string) => fields.find((f) => f.label.fr === fr)?.value;
    expect(valueOf("Dénomination sociale")?.fr).toBe("Global Toothgems SAS");
    expect(valueOf("Forme juridique")).toEqual({ fr: "SAS au capital de 10 000 €", en: "SAS with share capital of 10 000 €" });
    expect(valueOf("Siège social / adresse")?.fr).toBe("1 rue Fictive, 75004 Paris, France");
    expect(valueOf("E-mail de contact")?.fr).toBe("support@example.com");
    expect(valueOf("Numéro d’immatriculation")).toBeUndefined();
    expect(valueOf("Téléphone")).toBeUndefined(); // not shown to customers
    const contact = doc.sections.find((s) => s.id === "contact")?.blocks[0];
    expect(contact?.kind === "p" && contact.text.en).toContain("write to us at support@example.com");
  });
});
