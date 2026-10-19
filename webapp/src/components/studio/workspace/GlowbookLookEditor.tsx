import { useId, useMemo, useRef, useState, type ChangeEvent } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { Check, Clock3, ImagePlus, LoaderCircle, Palette, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "../../ui/Button";
import { GlowbookHero } from "../../glowbook/GlowbookHero";
import { glowbookThemeStyle } from "../../glowbook/theme";
import {
  ACCENT_COLORS,
  ACCENTS,
  BACKGROUNDS,
  LAYOUTS,
  LOCATION_MAX,
  normalizeLink,
  validateLook,
  type GlowbookLook,
  type LookProblem,
  type MediaKind,
} from "../../../lib/studioWorkspace/glowbookLook";
import type { Glowbook } from "../../../lib/studioWorkspace/glowbook";
import { certifiedTitles } from "../../../lib/studioWorkspace/glowbookSections";
import { useGlowbook } from "../../../lib/studioWorkspace/glowbookStore";
import { useWorkspace } from "../../../lib/studioWorkspace/workspace";
import { useToast } from "../../../lib/toast";
import { chipClass, fieldClass, focusRing } from "./workspaceStyles";

/**
 * "Customise my page" (decision 100): the artist's Glowbook in their own look,
 * with a live preview drawn by the same component as the public page.
 * Colour, background, layout, spotlight and city are public as soon as they
 * are saved; a new picture or link waits for a moderator while the page keeps
 * the approved one (the badge says so). Removing one is immediate.
 */
export function GlowbookLookEditor({ glowbook }: { glowbook: Glowbook }) {
  const { t, i18n } = useTranslation();
  const gb = useGlowbook();
  const ws = useWorkspace();
  const base = gb.draftLook!;
  const badge = glowbook.showCertification && gb.certification ? certifiedTitles(gb.certification, i18n.language) : [];
  const [draft, setDraft] = useState<GlowbookLook>(base);
  const [problem, setProblem] = useState<LookProblem | null>(null);
  const [busy, setBusy] = useState(false);
  const ids = { location: useId(), booking: useId(), website: useId(), tiktok: useId(), featured: useId(), error: useId() };

  // Back to what is stored whenever the store changes it (after a save, a reload).
  const [seen, setSeen] = useState(base);
  if (seen !== base) {
    setSeen(base);
    setDraft(base);
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(base);
  const set = <K extends keyof GlowbookLook>(key: K, value: GlowbookLook[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const waits = (key: "avatarPath" | "bannerPath" | "bookingUrl" | "websiteUrl" | "tiktok") =>
    !!draft[key] && draft[key] !== glowbook.look[key];

  const approvedItems = useMemo(
    () =>
      gb.items
        .filter((i) => i.status === "approved")
        .flatMap((i) => {
          const creation = ws.creations.find((c) => c.id === i.creationId);
          return creation ? [{ id: i.id, name: creation.name }] : [];
        }),
    [gb.items, ws.creations],
  );

  const save = async () => {
    const next: GlowbookLook = {
      ...draft,
      bookingUrl: draft.bookingUrl ? normalizeLink(draft.bookingUrl) : null,
      websiteUrl: draft.websiteUrl ? normalizeLink(draft.websiteUrl) : null,
      tiktok: draft.tiktok ? draft.tiktok.trim().replace(/^@/, "") || null : null,
      location: draft.location?.trim() || null,
    };
    const found = validateLook(next);
    setProblem(found);
    if (found) return;
    setBusy(true);
    await gb.saveLook(next);
    setBusy(false);
  };

  const pendingNote =
    Object.keys(glowbook.pending).length > 0
      ? t("studio.glowbook.look.pendingNote")
      : glowbook.changesReviewNote !== null
        ? glowbook.changesReviewNote
          ? t("studio.glowbook.look.rejectedNoteReason", { note: glowbook.changesReviewNote })
          : t("studio.glowbook.look.rejectedNote")
        : null;

  return (
    <section
      aria-labelledby="gt-glowbook-look"
      className="grid gap-5 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5 shadow-[var(--shadow-sm)] sm:p-6"
    >
      <div className="grid gap-1">
        <h2 id="gt-glowbook-look" className="m-0 inline-flex items-center gap-2 text-[length:var(--text-h4)] font-[var(--weight-black)] tracking-[var(--tracking-tight)] text-[var(--text-primary)]">
          <Palette size={18} aria-hidden="true" className="text-[var(--gt-blue-600)]" />
          {t("studio.glowbook.look.title")}
        </h2>
        <p className="m-0 text-[13px] leading-relaxed text-[var(--text-muted)]">{t("studio.glowbook.look.sub")}</p>
      </div>

      {pendingNote && (
        <p
          role="status"
          className="m-0 flex items-start gap-2 rounded-[var(--radius-md)] bg-[var(--status-warning-bg)] px-3 py-2 text-[12.5px] leading-relaxed text-[var(--status-warning-fg)]"
        >
          <Clock3 size={14} aria-hidden="true" className="mt-0.5 flex-none" />
          {pendingNote}
        </p>
      )}

      {/* Live preview, drawn like the public page. */}
      <figure className="m-0 grid gap-2">
        <figcaption className="text-[11px] font-bold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-subtle)]">{t("studio.glowbook.look.preview")}</figcaption>
        <div style={glowbookThemeStyle(draft)} className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--gb-page)]">
          <GlowbookHero
            preview
            displayName={glowbook.displayName}
            handle={glowbook.handle}
            bio={glowbook.bio}
            instagram={glowbook.instagram}
            look={draft}
            avatarUrl={draft.avatarPath ? (gb.mediaUrls.get(draft.avatarPath) ?? null) : null}
            bannerUrl={draft.bannerPath ? (gb.mediaUrls.get(draft.bannerPath) ?? null) : null}
            certifiedTitles={badge}
          />
        </div>
      </figure>

      <div className="grid gap-5 md:grid-cols-2">
        <PictureField kind="avatar" path={draft.avatarPath} waiting={waits("avatarPath")} onChange={(p) => set("avatarPath", p)} />
        <PictureField kind="banner" path={draft.bannerPath} waiting={waits("bannerPath")} onChange={(p) => set("bannerPath", p)} />
      </div>

      <fieldset className="m-0 grid gap-2 border-0 p-0">
        <legend className="mb-2 p-0 text-[12.5px] font-bold text-[var(--text-primary)]">{t("studio.glowbook.look.accent")}</legend>
        <div role="radiogroup" aria-label={t("studio.glowbook.look.accent")} className="flex flex-wrap gap-2">
          {ACCENTS.map((accent) => {
            const on = draft.accent === accent;
            return (
              <button
                key={accent}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={t(`studio.glowbook.look.accents.${accent}`)}
                title={t(`studio.glowbook.look.accents.${accent}`)}
                onClick={() => set("accent", accent)}
                className={clsx(
                  "grid h-9 w-9 place-items-center rounded-full border-2 transition-transform motion-safe:hover:scale-105",
                  on ? "border-[var(--gt-ink-900)]" : "border-transparent",
                  focusRing,
                )}
              >
                <span className="grid h-7 w-7 place-items-center rounded-full text-white" style={{ background: ACCENT_COLORS[accent].solid }}>
                  {on && <Check size={14} aria-hidden="true" />}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-5 md:grid-cols-2">
        <ChoiceRow
          label={t("studio.glowbook.look.background")}
          options={BACKGROUNDS.map((v) => ({ value: v, label: t(`studio.glowbook.look.backgrounds.${v}`) }))}
          value={draft.background}
          onChange={(v) => set("background", v)}
        />
        <ChoiceRow
          label={t("studio.glowbook.look.layout")}
          options={LAYOUTS.map((v) => ({ value: v, label: t(`studio.glowbook.look.layouts.${v}`) }))}
          value={draft.layout}
          onChange={(v) => set("layout", v)}
        />
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <div className="grid gap-1.5">
          <label htmlFor={ids.featured} className="text-[12.5px] font-bold text-[var(--text-primary)]">
            {t("studio.glowbook.look.featured")}
          </label>
          <select
            id={ids.featured}
            value={draft.featuredItemId ?? ""}
            onChange={(e) => set("featuredItemId", e.target.value || null)}
            className={fieldClass}
          >
            <option value="">{t("studio.glowbook.look.featuredNone")}</option>
            {approvedItems.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
          <p className="m-0 text-[12px] text-[var(--text-subtle)]">{t("studio.glowbook.look.featuredHint")}</p>
        </div>
        <div className="grid gap-1.5">
          <label htmlFor={ids.location} className="text-[12.5px] font-bold text-[var(--text-primary)]">
            {t("studio.glowbook.look.location")}
          </label>
          <input
            id={ids.location}
            value={draft.location ?? ""}
            maxLength={LOCATION_MAX}
            placeholder={t("studio.glowbook.look.locationPlaceholder")}
            aria-invalid={problem === "locationLength"}
            onChange={(e) => set("location", e.target.value || null)}
            className={fieldClass}
          />
        </div>
      </div>

      <fieldset className="m-0 grid gap-3 border-0 p-0">
        <legend className="mb-1 p-0 text-[12.5px] font-bold text-[var(--text-primary)]">{t("studio.glowbook.look.links")}</legend>
        <p className="m-0 -mt-1 text-[12px] text-[var(--text-subtle)]">{t("studio.glowbook.look.linksHint")}</p>
        <LinkField
          id={ids.booking}
          label={t("studio.glowbook.look.booking")}
          placeholder="https://"
          value={draft.bookingUrl}
          waiting={waits("bookingUrl")}
          invalid={problem === "bookingUrl"}
          errorId={ids.error}
          onChange={(v) => set("bookingUrl", v)}
        />
        <LinkField
          id={ids.website}
          label={t("studio.glowbook.look.website")}
          placeholder="https://"
          value={draft.websiteUrl}
          waiting={waits("websiteUrl")}
          invalid={problem === "websiteUrl"}
          errorId={ids.error}
          onChange={(v) => set("websiteUrl", v)}
        />
        <LinkField
          id={ids.tiktok}
          label={t("studio.glowbook.look.tiktok")}
          placeholder="@"
          value={draft.tiktok}
          waiting={waits("tiktok")}
          invalid={problem === "tiktok"}
          errorId={ids.error}
          onChange={(v) => set("tiktok", v)}
        />
        {problem && (
          <p id={ids.error} role="alert" className="m-0 text-[12px] font-semibold text-[var(--status-error-fg)]">
            {t(`studio.glowbook.look.errors.${problem}`, { max: LOCATION_MAX })}
          </p>
        )}
      </fieldset>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--border-subtle)] pt-4">
        {dirty && (
          <Button variant="ghost" size="sm" iconLeft={RotateCcw} onClick={() => setDraft(base)} disabled={busy}>
            {t("studio.glowbook.look.reset")}
          </Button>
        )}
        <Button variant="dark" size="sm" iconLeft={Check} loading={busy} disabled={!dirty} onClick={() => void save()}>
          {t("studio.glowbook.look.save")}
        </Button>
      </div>
    </section>
  );
}

function WaitingBadge() {
  const { t } = useTranslation();
  return (
    <span className="inline-flex items-center gap-1 rounded-[var(--radius-pill)] bg-[var(--status-warning-bg)] px-2 py-0.5 text-[10.5px] font-bold text-[var(--status-warning-fg)]">
      <Clock3 size={11} aria-hidden="true" />
      {t("studio.glowbook.look.waiting")}
    </span>
  );
}

function PictureField({ kind, path, waiting, onChange }: { kind: MediaKind; path: string | null; waiting: boolean; onChange: (path: string | null) => void }) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const gb = useGlowbook();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const url = path ? (gb.mediaUrls.get(path) ?? null) : null;

  const pick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    const result = await gb.uploadPicture(kind, file);
    setUploading(false);
    if ("path" in result) onChange(result.path);
    else if (result.error !== "failed") showToast(t(`studio.glowbook.look.pictureErrors.${result.error}`), undefined, "warning");
  };

  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-2">
        <span className="text-[12.5px] font-bold text-[var(--text-primary)]">{t(`studio.glowbook.look.${kind}`)}</span>
        {waiting && <WaitingBadge />}
      </div>
      <div className="flex items-center gap-3">
        <span
          className={clsx(
            "grid flex-none place-items-center overflow-hidden border border-[var(--border-subtle)] bg-[var(--surface-sunken)] text-[var(--text-subtle)]",
            kind === "avatar" ? "h-16 w-16 rounded-full" : "h-16 w-[120px] rounded-[var(--radius-md)]",
          )}
        >
          {uploading ? (
            <LoaderCircle size={18} aria-hidden="true" className="motion-safe:animate-spin" />
          ) : url ? (
            // eslint-disable-next-line @next/next/no-img-element -- signed Storage URL or local preview
            <img src={url} alt="" className="h-full w-full object-cover" />
          ) : (
            <ImagePlus size={18} aria-hidden="true" />
          )}
        </span>
        <div className="flex flex-wrap gap-2">
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => void pick(e)} />
          <Button variant="outline" size="sm" iconLeft={ImagePlus} disabled={uploading} onClick={() => input.current?.click()}>
            {t(path ? "studio.glowbook.look.change" : "studio.glowbook.look.add")}
          </Button>
          {path && (
            <Button variant="ghost" size="sm" iconLeft={Trash2} disabled={uploading} onClick={() => onChange(null)}>
              {t("studio.glowbook.look.removePicture")}
            </Button>
          )}
        </div>
      </div>
      <p className="m-0 text-[12px] text-[var(--text-subtle)]">{t(`studio.glowbook.look.${kind}Hint`)}</p>
    </div>
  );
}

function ChoiceRow<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="grid gap-2">
      <span className="text-[12.5px] font-bold text-[var(--text-primary)]">{label}</span>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button key={o.value} type="button" role="radio" aria-checked={o.value === value} onClick={() => onChange(o.value)} className={chipClass(o.value === value)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function LinkField({
  id,
  label,
  placeholder,
  value,
  waiting,
  invalid,
  errorId,
  onChange,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string | null;
  waiting: boolean;
  invalid: boolean;
  errorId: string;
  onChange: (value: string | null) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center gap-2">
        <label htmlFor={id} className="text-[12px] font-semibold text-[var(--text-primary)]">
          {label}
        </label>
        {waiting && <WaitingBadge />}
      </div>
      <input
        id={id}
        value={value ?? ""}
        placeholder={placeholder}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        aria-invalid={invalid}
        aria-describedby={invalid ? errorId : undefined}
        onChange={(e) => onChange(e.target.value || null)}
        className={fieldClass}
      />
    </div>
  );
}
