import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { Check, ImageOff, Monitor, Rocket, Save, SearchX, Smartphone } from "lucide-react";
import clsx from "clsx";
import { AdminButton } from "../../components/admin/AdminButton";
import { AdminHeader } from "../../components/admin/AdminHeader";
import { ConfirmationDialog } from "../../components/admin/ConfirmationDialog";
import { FormField } from "../../components/admin/FormField";
import { usePromotions } from "../../lib/adminPromotions";
import { useToast } from "../../lib/toast";
import { CONTENT_LANGS, type ContentLang } from "../../lib/localized";
import { photo } from "../../lib/images";
import {
  CAMPAIGN_THEMES,
  COVER_LIBRARY,
  NOW_TIME,
  blankCampaign,
  promotionStatus,
  toTime,
  type Campaign,
} from "../../data/adminPromotions";
import { DiscountChip, PromotionStatusBadge, useDiscountLabel } from "../../components/promotions/PromoBadges";
import { FormSection, Notice, PrototypeBar, Segmented } from "../../components/promotions/PromoUi";
import { ProductPicker } from "../../components/promotions/ProductPicker";
import { PreviewCampaignLanding, PreviewFrame, PreviewProductCard } from "../../components/promotions/StorefrontPreviews";
import { PromoEmpty } from "../../components/promotions/PromoEmpty";
import { ScheduleTimeline } from "../../components/promotions/Timeline";
import { useAdminCatalog } from "../../lib/adminCatalog";
import { useAdminShell } from "./AdminLayout";

/**
 * Create or edit a campaign, with the storefront beside the form.
 *
 * A campaign is mostly presentation — a headline, a banner, a theme — so the
 * live preview is not a garnish here, it is half the page: every keystroke in
 * the customer-facing title re-renders the banner, and a desktop / mobile
 * switch shows the same landing at both widths. It is a mockup of the shop,
 * labelled as one, never a live storefront.
 */
export function CampaignEditor() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams();
  const { openNav } = useAdminShell();
  const store = usePromotions();
  const existing = id ? store.getCampaign(id) : undefined;

  if (id && !existing) {
    return (
      <>
        <AdminHeader title={t("promo.notFound.campaign")} onOpenNav={openNav} />
        <div className="px-[var(--admin-gutter)] pt-5">
          <div className="gt-admin-panel">
            <PromoEmpty icon={SearchX} tone="neutral" title={t("promo.notFound.campaign")} body={t("promo.notFound.campaignBody")} actions={<AdminButton variant="dark" onClick={() => navigate("/admin/promotions?vue=campagnes")}>{t("promo.common.backToCampaigns")}</AdminButton>} />
          </div>
        </div>
      </>
    );
  }
  return <CampaignForm key={id ?? "new"} initial={existing ?? blankCampaign()} isNew={!existing} />;
}

function CampaignForm({ initial, isNew }: { initial: Campaign; isNew: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { openNav } = useAdminShell();
  const { showToast } = useToast();
  const store = usePromotions();
  const discount = useDiscountLabel();
  const { products } = useAdminCatalog();

  const [draft, setDraft] = useState<Campaign>(initial);
  const [attached, setAttached] = useState<string[]>(() => store.promotions.filter((p) => p.campaignId === initial.id && initial.id).map((p) => p.id));
  const [lang, setLang] = useState<ContentLang>("fr");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState<"draft" | "publish" | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);

  const set = (patch: Partial<Campaign>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
  };

  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (!draft.name.trim()) e.name = t("promo.validation.nameRequired");
    if (!draft.title.fr.trim() && !draft.title.en.trim()) e.title = t("promo.validation.titleRequired");
    if (toTime(draft.endsAt) <= toTime(draft.startsAt)) e.dates = t("promo.validation.endBeforeStart");
    return e;
  }, [draft, t]);

  const candidates = store.promotions.filter((p) => !["archived", "expired"].includes(promotionStatus(p)) || attached.includes(p.id));
  const previewPromotions = store.promotions.filter((p) => attached.includes(p.id));
  const firstProduct = products.find((p) => p.id === draft.productIds[0]);

  const save = async (mode: "draft" | "publish") => {
    const blocking = mode === "draft" ? (errors.name ? 1 : 0) : Object.keys(errors).length;
    if (blocking) {
      setShowErrors(true);
      showToast(t("promo.editor.toast.fix", { count: blocking }), t("promo.editor.toast.fixBody"), "error");
      document.getElementById("campaign-basics")?.scrollIntoView({ block: "start" });
      return;
    }
    setSaving(mode);
    const saved = await store.saveCampaign({ ...draft, lifecycle: mode === "publish" ? "live" : isNew ? "draft" : draft.lifecycle });
    const previously = store.promotions.filter((p) => p.campaignId === saved.id).map((p) => p.id);
    const toAdd = attached.filter((pid) => !previously.includes(pid));
    const toRemove = previously.filter((pid) => !attached.includes(pid));
    if (toAdd.length) await store.assignCampaign(toAdd, saved.id);
    if (toRemove.length) await store.assignCampaign(toRemove, null);
    setSaving(null);
    setDirty(false);
    showToast(mode === "publish" ? t("promo.campaigns.toastPublished", { name: saved.name }) : t("promo.editor.toast.saved", { name: saved.name }));
    navigate(`/admin/promotions/campagnes/${saved.id}`);
  };

  const cancel = () => (dirty ? setLeaveOpen(true) : navigate(isNew ? "/admin/promotions?vue=campagnes" : `/admin/promotions/campagnes/${draft.id}`));
  const err = (key: string) => (showErrors ? errors[key] : undefined);

  return (
    <>
      <AdminHeader
        title={isNew ? t("promo.campaigns.titleNew") : t("promo.editor.titleEdit", { name: initial.name })}
        description={t("promo.campaigns.editorDescription")}
        crumbs={[
          { label: t("admin.nav.promotions"), to: "/admin/promotions" },
          { label: t("promo.tabs.campaigns"), to: "/admin/promotions?vue=campagnes" },
          { label: isNew ? t("promo.editor.crumbNew") : initial.name },
        ]}
        onOpenNav={openNav}
        actions={
          <span className="flex items-center gap-2">
            <span><span className="hidden md:inline-flex"><AdminButton variant="ghost" onClick={cancel} disabled={!!saving}>
              {t("promo.common.cancel")}
            </AdminButton></span></span>
            <span className="hidden sm:inline-flex"><AdminButton variant="outline" iconLeft={Save} loading={saving === "draft"} disabled={!!saving} onClick={() => save("draft")}>
              {t("promo.editor.saveDraft")}
            </AdminButton></span>
            <AdminButton variant="primary" iconLeft={Rocket} loading={saving === "publish"} disabled={!!saving} onClick={() => save("publish")}>
              {toTime(draft.startsAt) > NOW_TIME ? t("promo.campaigns.schedule") : t("promo.campaigns.publish")}
            </AdminButton>
          </span>
        }
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 px-[var(--admin-gutter)] pb-[clamp(32px,5vw,56px)] pt-5">
        <PrototypeBar showModes={false} />
        {showErrors && Object.keys(errors).length > 0 && <Notice tone="error" title={t("promo.editor.invalidTitle", { count: Object.keys(errors).length })}>{Object.values(errors).join(" · ")}</Notice>}

        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(380px,.8fr)]">
          <div className="grid min-w-0 gap-4">
            <FormSection id="campaign-basics" letter="A" title={t("promo.campaigns.form.basics")} state={showErrors && (errors.name || errors.title) ? "issue" : undefined}>
              <FormField label={t("promo.campaigns.form.name")} hint={t("promo.campaigns.form.nameHint")} error={err("name")} required>
                {(a) => <input {...a} type="text" value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="Christmas 2027" className="gt-admin-field" />}
              </FormField>
              <FormField label={t("promo.editor.basics.internal")}>
                {(a) => <textarea {...a} rows={2} value={draft.internalDescription} onChange={(e) => set({ internalDescription: e.target.value })} className="gt-admin-field" />}
              </FormField>
              <div className="grid grid-cols-[minmax(0,1fr)] gap-4 rounded-[var(--admin-radius)] border border-[var(--gt-fuchsia-300)] bg-[linear-gradient(180deg,var(--gt-fuchsia-50),transparent_70%)] p-4">
                <FormField
                  label={t("promo.campaigns.form.headline", { lang: lang.toUpperCase() })}
                  hint={t("promo.campaigns.form.headlineHint")}
                  error={err("title")}
                  required
                  aside={<Segmented label={t("promo.editor.contentLanguage")} hideLabel size="sm" value={lang} onChange={setLang} options={CONTENT_LANGS.map((l) => ({ value: l, label: `${l.toUpperCase()}${draft.title[l].trim() ? " ✓" : ""}` }))} />}
                >
                  {(a) => <input {...a} type="text" lang={lang} maxLength={48} value={draft.title[lang]} onChange={(e) => set({ title: { ...draft.title, [lang]: e.target.value } })} placeholder={lang === "fr" ? "Faites briller leur sourire" : "Make Their Smile Sparkle"} className="gt-admin-field" />}
                </FormField>
                <FormField label={t("promo.campaigns.form.subtitle", { lang: lang.toUpperCase() })} aside={<span className="text-[11px] tabular-nums text-[var(--text-muted)]">{draft.description[lang].length}/160</span>}>
                  {(a) => <textarea {...a} rows={2} lang={lang} maxLength={160} value={draft.description[lang]} onChange={(e) => set({ description: { ...draft.description, [lang]: e.target.value } })} className="gt-admin-field" />}
                </FormField>
              </div>
            </FormSection>

            <FormSection id="campaign-dates" letter="B" title={t("promo.campaigns.form.dates")} state={showErrors && errors.dates ? "issue" : undefined}>
              <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2">
                <label className="grid grid-cols-[minmax(0,1fr)] gap-1">
                  <span className="text-[length:var(--text-caption)] font-semibold">{t("promo.editor.schedule.start")}</span>
                  <input type="datetime-local" value={draft.startsAt} onChange={(e) => set({ startsAt: e.target.value })} className="gt-admin-field" />
                </label>
                <label className="grid grid-cols-[minmax(0,1fr)] gap-1">
                  <span className="text-[length:var(--text-caption)] font-semibold">{t("promo.editor.schedule.end")}</span>
                  <input type="datetime-local" value={draft.endsAt} min={draft.startsAt} aria-invalid={err("dates") ? true : undefined} onChange={(e) => set({ endsAt: e.target.value })} className="gt-admin-field" />
                </label>
              </div>
              {err("dates") && <p className="m-0 text-[length:var(--text-caption)] font-medium text-[var(--status-error-fg)]">{err("dates")}</p>}
              <ScheduleTimeline startsAt={draft.startsAt} endsAt={draft.endsAt} invalid={!!errors.dates} />
            </FormSection>

            <FormSection id="campaign-visual" letter="C" title={t("promo.campaigns.form.visual")} description={t("promo.campaigns.form.visualHint")}>
              <fieldset className="m-0 border-0 p-0">
                <legend className="mb-2 p-0 text-[length:var(--text-caption)] font-semibold">{t("promo.campaigns.form.cover")}</legend>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  <CoverOption selected={draft.cover === null} onSelect={() => set({ cover: null })} label={t("promo.campaigns.form.noCover")}>
                    <span className="grid h-full w-full place-items-center bg-[var(--surface-sunken)] text-[var(--text-muted)]">
                      <ImageOff size={18} aria-hidden="true" />
                    </span>
                  </CoverOption>
                  {COVER_LIBRARY.map((file, i) => (
                    <CoverOption key={file} selected={draft.cover === file} onSelect={() => set({ cover: file })} label={t("promo.campaigns.form.coverN", { n: i + 1 })}>
                      <img src={photo(file)} alt="" className="h-full w-full object-cover" />
                    </CoverOption>
                  ))}
                </div>
              </fieldset>
              <fieldset className="m-0 border-0 p-0">
                <legend className="mb-2 p-0 text-[length:var(--text-caption)] font-semibold">{t("promo.campaigns.form.theme")}</legend>
                <div className="flex flex-wrap gap-2">
                  {CAMPAIGN_THEMES.map((theme) => {
                    const on = draft.theme === theme;
                    return (
                      <label
                        key={theme}
                        className={clsx(
                          "inline-flex cursor-pointer items-center gap-2 rounded-[var(--radius-pill)] border py-1 pl-1 pr-3 text-[length:var(--text-caption)] font-semibold transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus-ring)]",
                          on ? "border-[var(--gt-ink-900)] shadow-[inset_0_0_0_1px_var(--gt-ink-900)]" : "border-[var(--border-default)] hover:border-[var(--gt-ink-400)]",
                        )}
                      >
                        <input type="radio" name="campaign-theme" checked={on} onChange={() => set({ theme })} className="sr-only" />
                        <span aria-hidden="true" data-theme={theme} className="gt-campaign-cover relative grid h-7 w-7 place-items-center overflow-hidden rounded-full">
                          <span className="gt-campaign-wash absolute inset-0" />
                          {on && <Check size={13} strokeWidth={3} className={clsx("relative", theme === "noir" || theme === "winter" ? "text-[var(--gt-white)]" : "text-[var(--gt-ink-900)]")} />}
                        </span>
                        {t(`promo.theme.${theme}`)}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            </FormSection>

            <FormSection id="campaign-content" letter="D" title={t("promo.campaigns.form.content")} description={t("promo.campaigns.form.contentHint")}>
              <ProductPicker label={t("promo.campaigns.products")} selected={draft.productIds} onChange={(productIds) => set({ productIds })} />
              <fieldset className="m-0 grid gap-1.5 border-0 p-0">
                <legend className="mb-1.5 p-0 text-[length:var(--text-caption)] font-semibold">{t("promo.campaigns.promotionsLabel")}</legend>
                {candidates.length === 0 && <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("promo.dialogs.addPromotions.none")}</p>}
                <div className="gt-admin-scroll grid max-h-[300px] gap-1.5 overflow-y-auto pr-1">
                  {candidates.map((p) => {
                    const on = attached.includes(p.id);
                    const elsewhere = p.campaignId && p.campaignId !== draft.id;
                    return (
                      <label key={p.id} className={clsx("flex cursor-pointer items-center gap-3 rounded-[var(--admin-radius-sm)] border p-2.5 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--focus-ring)]", on ? "border-[var(--gt-ink-900)] bg-[var(--gt-blue-50)]" : "border-[var(--border-subtle)] hover:border-[var(--gt-ink-400)]")}>
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => {
                            setAttached((prev) => (on ? prev.filter((x) => x !== p.id) : [...prev, p.id]));
                            setDirty(true);
                          }}
                          className="h-4 w-4 accent-[var(--gt-ink-900)]"
                        />
                        <span className="grid min-w-0 flex-1 leading-tight">
                          <span className="truncate text-[length:var(--text-body-sm)] font-semibold">{p.name}</span>
                          {elsewhere && <span className="truncate text-[11px] text-[var(--status-warning-fg)]">{t("promo.dialogs.addPromotions.moveFrom", { name: store.campaignName(p.campaignId) })}</span>}
                        </span>
                        <DiscountChip label={discount(p)} size="sm" />
                        <PromotionStatusBadge status={promotionStatus(p)} />
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            </FormSection>
          </div>

          <aside aria-label={t("promo.campaigns.livePreview")} className="grid grid-cols-[minmax(0,1fr)] gap-3 xl:sticky xl:top-[calc(var(--admin-header-h)+16px)]">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[length:var(--text-body-md)]">{t("promo.campaigns.livePreview")}</h2>
              <Segmented
                label={t("promo.preview.device")}
                hideLabel
                size="sm"
                value={device}
                onChange={setDevice}
                options={[
                  { value: "desktop", label: t("promo.preview.desktop"), icon: Monitor },
                  { value: "mobile", label: t("promo.preview.mobile"), icon: Smartphone },
                ]}
              />
            </div>
            <div className="rounded-[var(--radius-xl)] bg-[radial-gradient(600px_300px_at_80%_0%,var(--gt-blue-100),transparent),var(--admin-panel-sunken)] p-3 sm:p-4">
              <div className={clsx("mx-auto transition-[max-width] duration-[var(--duration-slow)] ease-[var(--ease-out-soft)]", device === "mobile" ? "max-w-[340px]" : "max-w-full")}>
                <PreviewFrame label={`globaltoothgems.com/${draft.name ? draft.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") : "campagne"}`}>
                  <PreviewCampaignLanding campaign={draft} promotions={previewPromotions} productIds={draft.productIds} />
                </PreviewFrame>
              </div>
            </div>
            {firstProduct && (
              <PreviewFrame label={t("promo.preview.productCard")}>
                <div className="mx-auto w-full max-w-[230px] p-3">
                  <PreviewProductCard product={firstProduct} promotion={previewPromotions[0] ?? null} campaign={draft.name ? draft : null} />
                </div>
              </PreviewFrame>
            )}
            <p className="m-0 text-[11px] text-[var(--text-muted)]">{t("promo.preview.disclaimer")}</p>
          </aside>
        </div>
      </div>

      <ConfirmationDialog
        open={leaveOpen}
        title={t("promo.dialogs.discard.title")}
        body={t("promo.dialogs.discard.body")}
        confirmLabel={t("promo.dialogs.discard.confirm")}
        cancelLabel={t("promo.dialogs.discard.keep")}
        tone="danger"
        onCancel={() => setLeaveOpen(false)}
        onConfirm={() => navigate(isNew ? "/admin/promotions?vue=campagnes" : `/admin/promotions/campagnes/${draft.id}`)}
      />
    </>
  );
}

function CoverOption({ selected, onSelect, label, children }: { selected: boolean; onSelect: () => void; label: string; children: React.ReactNode }) {
  return (
    <label
      className={clsx(
        "relative aspect-[4/3] cursor-pointer overflow-hidden rounded-[var(--admin-radius-sm)] border-2 transition-[border-color,transform] duration-[var(--duration-fast)] hover:-translate-y-px has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus-ring)]",
        selected ? "border-[var(--gt-ink-900)]" : "border-transparent",
      )}
    >
      <input type="radio" name="campaign-cover" checked={selected} onChange={onSelect} className="sr-only" aria-label={label} />
      {children}
      {selected && (
        <span aria-hidden="true" className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-[var(--gt-ink-900)] text-[var(--gt-white)]">
          <Check size={12} strokeWidth={3} />
        </span>
      )}
    </label>
  );
}
