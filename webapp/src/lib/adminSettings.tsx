import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import {
  LANGUAGE_SETTINGS,
  SHIPPING_ZONES,
  STORE_DETAILS,
  TAX_SETTINGS,
  type LanguageSettings,
  type ShippingZone,
  type StoreDetails,
  type TaxSettings,
} from "../data/adminSettings";
import { TRANSLATION_ITEMS, type TrFieldKind, type TrItem, type TrValue } from "../data/adminTranslations";

/**
 * State of the Settings workspace.
 *
 * Every section edits a *draft* and commits it with Save — one interaction
 * model across the four sections, including the ones whose edits happen in a
 * drawer (a new shipping rate, a VAT row, a language switched off). Nothing an
 * administrator does reaches customers until they press Save, and Discard
 * always returns to exactly what is live.
 *
 * Drafts live here rather than in the section components so moving between
 * sections keeps unsaved work; "dirty" is a comparison with the saved value,
 * so undoing an edit by hand clears the indicator too.
 *
 * Translations are content, not configuration: the translation editor saves
 * each item on its own, the way the product editor would.
 *
 * Prototype only — held in memory, nothing is persisted or sent anywhere.
 */

export type SettingsSection = "store" | "shipping" | "taxes" | "languages";
export const SETTINGS_SECTIONS: SettingsSection[] = ["store", "shipping", "taxes", "languages"];

interface SectionValues {
  store: StoreDetails;
  shipping: ShippingZone[];
  taxes: TaxSettings;
  languages: LanguageSettings;
}

const INITIAL: SectionValues = {
  store: STORE_DETAILS,
  shipping: SHIPPING_ZONES,
  taxes: TAX_SETTINGS,
  languages: LANGUAGE_SETTINGS,
};

interface SettingsContextValue {
  saved: SectionValues;
  draft: SectionValues;
  update: <S extends SettingsSection>(section: S, next: (value: SectionValues[S]) => SectionValues[S]) => void;
  isDirty: (section: SettingsSection) => boolean;
  discard: (section: SettingsSection) => void;
  /** Resolves false when the (simulated) server refuses the save. */
  save: (section: SettingsSection) => Promise<boolean>;
  /** Set on the first Save attempt, so errors show on untouched fields too. */
  attempted: Record<SettingsSection, boolean>;
  setAttempted: (section: SettingsSection, value: boolean) => void;
  savedAt: Partial<Record<SettingsSection, Date>>;

  translations: TrItem[];
  /** Replaces the item's record in `lang`; empty values are dropped (missing). */
  saveTranslation: (itemId: string, lang: string, values: Partial<Record<TrFieldKind, TrValue>>) => Promise<boolean>;

  /** Prototype control: make the next saves fail, to show the error path. */
  failSaves: boolean;
  setFailSaves: (value: boolean) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

const SAVE_LATENCY = 650;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function AdminSettingsProvider({ children }: { children: ReactNode }) {
  const [saved, setSaved] = useState<SectionValues>(INITIAL);
  const [draft, setDraft] = useState<SectionValues>(INITIAL);
  const [attempted, setAttemptedState] = useState<Record<SettingsSection, boolean>>({
    store: false,
    shipping: false,
    taxes: false,
    languages: false,
  });
  const [savedAt, setSavedAt] = useState<Partial<Record<SettingsSection, Date>>>({});
  const [translations, setTranslations] = useState<TrItem[]>(TRANSLATION_ITEMS);
  const [failSaves, setFailSaves] = useState(false);

  const update = useCallback(
    <S extends SettingsSection>(section: S, next: (value: SectionValues[S]) => SectionValues[S]) => {
      setDraft((d) => ({ ...d, [section]: next(d[section]) }));
    },
    [],
  );

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
    async (section: SettingsSection) => {
      await wait(SAVE_LATENCY);
      if (failSaves) return false;
      setSaved((s) => ({ ...s, [section]: draft[section] }));
      setSavedAt((s) => ({ ...s, [section]: new Date() }));
      setAttempted(section, false);
      return true;
    },
    [draft, failSaves, setAttempted],
  );

  const saveTranslation = useCallback(
    async (itemId: string, lang: string, values: Partial<Record<TrFieldKind, TrValue>>) => {
      await wait(SAVE_LATENCY);
      if (failSaves) return false;
      setTranslations((items) =>
        items.map((item) => {
          if (item.id !== itemId || item.translations[lang] === "complete") return item;
          const next: Partial<Record<TrFieldKind, TrValue>> = {};
          for (const [key, v] of Object.entries(values) as [TrFieldKind, TrValue][]) {
            const trimmed = v.value.trim();
            if (trimmed) next[key] = v.outdated ? { value: trimmed, outdated: true } : { value: trimmed };
          }
          return { ...item, translations: { ...item.translations, [lang]: next } };
        }),
      );
      return true;
    },
    [failSaves],
  );

  const value = useMemo<SettingsContextValue>(
    () => ({
      saved,
      draft,
      update,
      isDirty,
      discard,
      save,
      attempted,
      setAttempted,
      savedAt,
      translations,
      saveTranslation,
      failSaves,
      setFailSaves,
    }),
    [saved, draft, update, isDirty, discard, save, attempted, setAttempted, savedAt, translations, saveTranslation, failSaves],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useAdminSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useAdminSettings must be used within AdminSettingsProvider");
  return ctx;
}
