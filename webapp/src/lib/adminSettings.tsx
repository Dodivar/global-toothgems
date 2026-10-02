import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { WEEKDAYS, type LanguageSettings, type ShippingZone, type StoreDetails, type TaxSettings } from "../data/adminSettings";
import {
  SHIPPING_ZONES_SELECT,
  languagesPayload,
  mapLanguages,
  mapShippingZones,
  mapTaxSettings,
  settingsWriteErrorOf,
  shippingPayload,
  taxPayload,
  type LanguageRow,
  type SettingsWriteError,
  type ShippingZoneRow,
  type TaxRateRow,
} from "./adminSettingsMapping";
import { fetchStoreDetails, storeDetailsPayload } from "./storeDetails";
import type { Json } from "./supabase/database.types";
import { isSupabaseConfigured, requireSupabase } from "./supabase/client";

/**
 * State of the Settings workspace — the single persistence boundary of the
 * store configuration (screens never call Supabase).
 *
 * Reads (any active staff member, RLS `is_staff`): `store_settings` and its
 * translations, `shipping_zones` with their countries and rates, `tax_rates`,
 * `languages`, and `my_permissions()`. Writes, one database function per
 * section, under the signed-in member's JWT and `manage_settings`:
 * `admin_save_store_details`, `admin_save_shipping`, `admin_save_tax_rates`,
 * `admin_save_languages` — each saves the whole section atomically and is
 * audited. `canManage` only decides what the screen offers; the database
 * decides what happens, and a refusal comes back as a reason the screen words,
 * never as a success.
 *
 * Every section edits a *draft* and commits it with Save — one interaction
 * model across the four sections, including the ones whose edits happen in a
 * drawer. Nothing an administrator does reaches customers until they press
 * Save, and Discard returns to exactly what is stored. A save re-reads its own
 * section only, so unsaved work in another section survives it. Drafts live
 * here rather than in the section components so moving between sections keeps
 * them; "dirty" is a comparison with the saved value, so undoing an edit by
 * hand clears the indicator too.
 *
 * Without Supabase (local mock mode) nothing is read or written and the
 * screen says the settings are unavailable: this is a live domain and never
 * shows invented values.
 */

export type SettingsSection = "store" | "shipping" | "taxes" | "languages";
export const SETTINGS_SECTIONS: SettingsSection[] = ["store", "shipping", "taxes", "languages"];

export interface SectionValues {
  store: StoreDetails;
  shipping: ShippingZone[];
  taxes: TaxSettings;
  languages: LanguageSettings;
}

export type SettingsStatus = "loading" | "ready" | "failed" | "unavailable";
export type SettingsSaveResult = { ok: true } | { ok: false; error: SettingsWriteError };
export type { SettingsWriteError };

interface SettingsContextValue {
  status: SettingsStatus;
  reload: () => void;
  /** `manage_settings` (navigation only: RLS and the functions decide). */
  canManage: boolean;
  saved: SectionValues;
  draft: SectionValues;
  update: <S extends SettingsSection>(section: S, next: (value: SectionValues[S]) => SectionValues[S]) => void;
  isDirty: (section: SettingsSection) => boolean;
  discard: (section: SettingsSection) => void;
  save: (section: SettingsSection) => Promise<SettingsSaveResult>;
  /** Set on the first Save attempt, so errors show on untouched fields too. */
  attempted: Record<SettingsSection, boolean>;
  setAttempted: (section: SettingsSection, value: boolean) => void;
  savedAt: Partial<Record<SettingsSection, Date>>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

const EMPTY: SectionValues = {
  store: {
    storeName: "",
    legalName: "",
    legalForm: "",
    shareCapital: "",
    registrationNumber: "",
    vatNumber: "",
    businessEmail: "",
    supportEmail: "",
    phone: "",
    country: "FR",
    address1: "",
    address2: "",
    postalCode: "",
    city: "",
    region: "",
    publicationDirector: "",
    publicationDirectorRole: "",
    hostName: "",
    hostAddress: "",
    hostContact: "",
    showEmail: true,
    showPhone: false,
    showAddress: false,
    hours: Object.fromEntries(WEEKDAYS.map((d) => [d, { open: false, from: "09:00", to: "18:00" }])) as StoreDetails["hours"],
    supportMessage: { fr: "", en: "" },
  },
  shipping: [],
  taxes: { rates: [], reduced: [] },
  languages: { languages: [] },
};

const NOT_ATTEMPTED: Record<SettingsSection, boolean> = { store: false, shipping: false, taxes: false, languages: false };

/* -------------------------------------------------------------------------- */
/* Reads and writes                                                           */
/* -------------------------------------------------------------------------- */

async function readSection<S extends SettingsSection>(section: S, signal?: AbortSignal): Promise<SectionValues[S]> {
  const client = requireSupabase();
  const abortable = <Q extends { abortSignal: (s: AbortSignal) => Q }>(q: Q) => (signal ? q.abortSignal(signal) : q);
  switch (section) {
    case "store":
      return (await fetchStoreDetails(client, signal)) as SectionValues[S];
    case "shipping": {
      const { data, error } = await abortable(client.from("shipping_zones").select(SHIPPING_ZONES_SELECT));
      if (error) throw error;
      return mapShippingZones((data ?? []) as unknown as ShippingZoneRow[]) as SectionValues[S];
    }
    case "taxes": {
      const { data, error } = await abortable(client.from("tax_rates").select("country_code, tax_category, rate_bp, is_active"));
      if (error) throw error;
      return mapTaxSettings((data ?? []) as TaxRateRow[]) as SectionValues[S];
    }
    default: {
      const { data, error } = await abortable(
        client.from("languages").select("code, locale, native_name, is_default, is_enabled, position"),
      );
      if (error) throw error;
      return mapLanguages((data ?? []) as LanguageRow[]) as SectionValues[S];
    }
  }
}

async function readAll(signal: AbortSignal): Promise<{ values: SectionValues; permissions: ReadonlySet<string> }> {
  const [mine, store, shipping, taxes, languages] = await Promise.all([
    requireSupabase().rpc("my_permissions").abortSignal(signal),
    readSection("store", signal),
    readSection("shipping", signal),
    readSection("taxes", signal),
    readSection("languages", signal),
  ]);
  if (mine.error) throw mine.error;
  return { values: { store, shipping, taxes, languages }, permissions: new Set(mine.data ?? []) };
}

async function writeSection(section: SettingsSection, values: SectionValues): Promise<SettingsWriteError | null> {
  const client = requireSupabase();
  const asJson = (v: unknown) => v as Json;
  const { error } =
    section === "store"
      ? await client.rpc("admin_save_store_details", { p_details: asJson(storeDetailsPayload(values.store)) })
      : section === "shipping"
        ? await client.rpc("admin_save_shipping", { p_zones: asJson(shippingPayload(values.shipping)) })
        : section === "taxes"
          ? await client.rpc("admin_save_tax_rates", { p_rates: asJson(taxPayload(values.taxes)) })
          : await client.rpc("admin_save_languages", { p_languages: asJson(languagesPayload(values.languages)) });
  if (!error) return null;
  console.error(`[settings] ${section} save refused`, error);
  return settingsWriteErrorOf(error);
}

/* -------------------------------------------------------------------------- */
/* Providers                                                                  */
/* -------------------------------------------------------------------------- */

export function AdminSettingsProvider({ children }: { children: ReactNode }) {
  return isSupabaseConfigured ? (
    <SupabaseSettingsProvider>{children}</SupabaseSettingsProvider>
  ) : (
    <UnavailableSettingsProvider>{children}</UnavailableSettingsProvider>
  );
}

function SupabaseSettingsProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SettingsStatus>("loading");
  const [attempt, setAttempt] = useState(0);
  const [permissions, setPermissions] = useState<ReadonlySet<string>>(new Set());
  const [saved, setSaved] = useState<SectionValues>(EMPTY);
  const [draft, setDraft] = useState<SectionValues>(EMPTY);
  const [attempted, setAttemptedState] = useState<Record<SettingsSection, boolean>>(NOT_ATTEMPTED);
  const [savedAt, setSavedAt] = useState<Partial<Record<SettingsSection, Date>>>({});

  useEffect(() => {
    const controller = new AbortController();
    readAll(controller.signal)
      .then(({ values, permissions: mine }) => {
        if (controller.signal.aborted) return;
        setSaved(values);
        setDraft(values);
        setPermissions(mine);
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.error("[settings] load failed", error);
        setStatus("failed");
      });
    return () => controller.abort();
  }, [attempt]);

  const reload = useCallback(() => {
    setStatus("loading");
    setAttempt((n) => n + 1);
  }, []);

  const update = useCallback(<S extends SettingsSection>(section: S, next: (value: SectionValues[S]) => SectionValues[S]) => {
    setDraft((d) => ({ ...d, [section]: next(d[section]) }));
  }, []);

  const isDirty = useCallback(
    (section: SettingsSection) => JSON.stringify(draft[section]) !== JSON.stringify(saved[section]),
    [draft, saved],
  );

  const setAttempted = useCallback((section: SettingsSection, value: boolean) => {
    setAttemptedState((a) => ({ ...a, [section]: value }));
  }, []);

  const discard = useCallback(
    (section: SettingsSection) => {
      setDraft((d) => ({ ...d, [section]: saved[section] }));
      setAttempted(section, false);
    },
    [saved, setAttempted],
  );

  const save = useCallback(
    async (section: SettingsSection): Promise<SettingsSaveResult> => {
      const refused = await writeSection(section, draft);
      if (refused) return { ok: false, error: refused };
      // What is stored now, normalised the way it reads; the save itself was
      // atomic, so if the re-read fails what was sent is what is stored.
      const stored = await readSection(section).catch((error: unknown) => {
        console.warn(`[settings] ${section} re-read after save failed`, error);
        return draft[section];
      });
      setSaved((s) => ({ ...s, [section]: stored }));
      setDraft((d) => ({ ...d, [section]: stored }));
      setSavedAt((s) => ({ ...s, [section]: new Date() }));
      setAttempted(section, false);
      return { ok: true };
    },
    [draft, setAttempted],
  );

  const value = useMemo<SettingsContextValue>(
    () => ({
      status,
      reload,
      canManage: permissions.has("manage_settings"),
      saved,
      draft,
      update,
      isDirty,
      discard,
      save,
      attempted,
      setAttempted,
      savedAt,
    }),
    [status, reload, permissions, saved, draft, update, isDirty, discard, save, attempted, setAttempted, savedAt],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

/** Local mock mode: nothing to read, every save refused. */
function UnavailableSettingsProvider({ children }: { children: ReactNode }) {
  const value = useMemo<SettingsContextValue>(
    () => ({
      status: "unavailable",
      reload: () => undefined,
      canManage: false,
      saved: EMPTY,
      draft: EMPTY,
      update: () => undefined,
      isDirty: () => false,
      discard: () => undefined,
      save: () => Promise.resolve({ ok: false, error: "unavailable" }),
      attempted: NOT_ATTEMPTED,
      setAttempted: () => undefined,
      savedAt: {},
    }),
    [],
  );
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useAdminSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useAdminSettings must be used within AdminSettingsProvider");
  return ctx;
}
