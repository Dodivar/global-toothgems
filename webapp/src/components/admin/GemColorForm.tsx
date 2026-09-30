import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Save, Sparkles } from "lucide-react";
import { AdminButton } from "./AdminButton";
import { FormField } from "./FormField";
import { SheetBody, SheetFooter } from "./AdminSheet";
import { ToggleSwitch } from "./ToggleSwitch";
import { ColorSwatch } from "../ui/ColorSwatch";
import { HEX_COLOR_PATTERN, type AdminGemColor, type GemColorDraft } from "../../data/adminCatalog";

/** Starting shade of a new colour: neutral, so nothing looks already chosen. */
const DEFAULT_HEX = "#9bb8e6";

type Field = "nameFr" | "nameEn" | "hex";

function validate(draft: GemColorDraft, isMulticolor: boolean): Partial<Record<Field, string>> {
  const errors: Partial<Record<Field, string>> = {};
  if (!draft.name.fr.trim()) errors.nameFr = "admin.gemColors.errors.nameFr";
  if (!draft.name.en.trim()) errors.nameEn = "admin.gemColors.errors.nameEn";
  if (!isMulticolor && !HEX_COLOR_PATTERN.test(draft.hex ?? "")) errors.hex = "admin.gemColors.errors.hex";
  return errors;
}

/**
 * Create or edit one colour of the storefront gem filter.
 *
 * Both names are required: the colour is a filter label customers read in
 * either language, and the database refuses a colour without its English name.
 * A colour is one exact shade, picked with the native colour input or typed
 * as `#rrggbb`; the multicolour entry has no shade and only its names change.
 */
export function GemColorForm({
  color,
  onSubmit,
  onCancel,
}: {
  /** Undefined = a new colour. */
  color?: AdminGemColor;
  onSubmit: (draft: GemColorDraft) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const isMulticolor = Boolean(color?.isMulticolor);
  const [draft, setDraft] = useState<GemColorDraft>(() => ({
    id: color?.id,
    name: { fr: color?.name.fr ?? "", en: color?.name.en ?? "" },
    hex: isMulticolor ? null : (color?.hex ?? DEFAULT_HEX),
    isActive: color?.isActive ?? true,
  }));
  // What is typed in the text field, kept apart so a half-typed value is not
  // pushed into the swatch.
  const [hexText, setHexText] = useState(draft.hex ?? "");
  const [submitted, setSubmitted] = useState(false);
  // Bumped by each refused submit, so focus moves to the first error once the
  // errors have rendered.
  const [refusedCount, setRefusedCount] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const [saving, setSaving] = useState(false);

  const errors = useMemo(() => validate(draft, isMulticolor), [draft, isMulticolor]);
  const errorOf = (field: Field) => (submitted && errors[field] ? t(errors[field]!) : undefined);

  const setName = (lang: "fr" | "en", value: string) =>
    setDraft((d) => ({ ...d, name: { ...d.name, [lang]: value } }));

  const setHex = (value: string) => {
    setHexText(value);
    const normalised = value.trim().toLowerCase();
    const withHash = normalised.startsWith("#") ? normalised : `#${normalised}`;
    setDraft((d) => ({ ...d, hex: withHash }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length > 0) {
      setRefusedCount((n) => n + 1);
      return;
    }
    setSaving(true);
    try {
      await onSubmit(draft);
    } catch {
      // The store already told the user why; keep the form open to retry.
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (refusedCount > 0) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [refusedCount]);

  const previewHex = draft.hex && HEX_COLOR_PATTERN.test(draft.hex) ? draft.hex : null;

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
      <SheetBody>
        <div className="grid gap-5">
          <FormField label={t("admin.gemColors.nameFr")} required error={errorOf("nameFr")}>
            {(props) => (
              <input
                {...props}
                data-autofocus
                type="text"
                className="gt-admin-field"
                maxLength={60}
                value={draft.name.fr}
                onChange={(e) => setName("fr", e.target.value)}
                placeholder={t("admin.gemColors.nameFrPlaceholder")}
              />
            )}
          </FormField>

          <FormField
            label={t("admin.gemColors.nameEn")}
            required
            error={errorOf("nameEn")}
            hint={t("admin.gemColors.nameEnHint")}
          >
            {(props) => (
              <input
                {...props}
                type="text"
                lang="en"
                className="gt-admin-field"
                maxLength={60}
                value={draft.name.en}
                onChange={(e) => setName("en", e.target.value)}
                placeholder={t("admin.gemColors.nameEnPlaceholder")}
              />
            )}
          </FormField>

          {isMulticolor ? (
            <div className="flex items-start gap-3 rounded-[var(--admin-radius)] bg-[var(--admin-panel-sunken)] p-4">
              <ColorSwatch color={{ hex: null, isMulticolor: true }} size={40} />
              <div className="grid gap-1">
                <p className="m-0 flex items-center gap-1.5 text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">
                  <Sparkles size={14} aria-hidden="true" />
                  {t("admin.gemColors.multicolorTitle")}
                </p>
                <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">
                  {t("admin.gemColors.multicolorBody")}
                </p>
              </div>
            </div>
          ) : (
            <FormField label={t("admin.gemColors.hex")} required error={errorOf("hex")} hint={t("admin.gemColors.hexHint")}>
              {(props) => (
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    aria-label={t("admin.gemColors.picker")}
                    value={previewHex ?? DEFAULT_HEX}
                    onChange={(e) => setHex(e.target.value)}
                    className="h-[var(--admin-control-h)] w-14 flex-none cursor-pointer rounded-[var(--admin-radius-sm)] border border-[var(--border-default)] bg-[var(--admin-panel)] p-1"
                  />
                  <input
                    {...props}
                    type="text"
                    className="gt-admin-field font-[family-name:var(--gt-font-mono)]"
                    value={hexText}
                    onChange={(e) => setHex(e.target.value)}
                    placeholder="#9bb8e6"
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={7}
                  />
                </div>
              )}
            </FormField>
          )}

          <div className="grid gap-2">
            <span className="text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)]">
              {t("admin.gemColors.preview")}
            </span>
            <div className="flex items-center gap-4 rounded-[var(--admin-radius)] border border-[var(--border-subtle)] p-4">
              <ColorSwatch color={{ hex: previewHex, isMulticolor }} size={56} />
              <ColorSwatch color={{ hex: previewHex, isMulticolor }} size={28} />
              <span className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--border-default)] py-1 pl-1.5 pr-3 text-[length:var(--text-caption)] font-medium text-[var(--text-primary)]">
                <ColorSwatch color={{ hex: previewHex, isMulticolor }} size={20} />
                {draft.name.fr.trim() || t("admin.gemColors.previewName")}
              </span>
            </div>
          </div>

          <ToggleSwitch
            label={t("admin.gemColors.visible")}
            description={t("admin.gemColors.visibleHint")}
            checked={draft.isActive}
            onChange={(isActive) => setDraft((d) => ({ ...d, isActive }))}
          />
        </div>
      </SheetBody>
      <SheetFooter>
        <AdminButton type="submit" variant="dark" iconLeft={Save} loading={saving}>
          {color ? t("admin.gemColors.save") : t("admin.gemColors.create")}
        </AdminButton>
        <AdminButton variant="ghost" onClick={onCancel} disabled={saving}>
          {t("admin.gemColors.cancel")}
        </AdminButton>
      </SheetFooter>
    </form>
  );
}
