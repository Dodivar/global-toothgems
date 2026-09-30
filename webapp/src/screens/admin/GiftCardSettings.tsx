import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ArrowDown, ArrowUp, Check, ExternalLink, GripVertical, Plus, RotateCcw, Save, X } from "lucide-react";
import clsx from "clsx";
import { AdminButton } from "../../components/admin/AdminButton";
import { AdminHeader } from "../../components/admin/AdminHeader";
import { AdminSelect } from "../../components/admin/AdminSelect";
import { FormField } from "../../components/admin/FormField";
import { ToggleSwitch } from "../../components/admin/ToggleSwitch";
import { usePromotions } from "../../lib/adminPromotions";
import { useToast } from "../../lib/toast";
import { CONTENT_LANGS, useLocalized, type ContentLang } from "../../lib/localized";
import { centsToInput, parseEuros } from "../../lib/promotionRules";
import { type FieldMode, type GiftCardDesign, type GiftCardProductConfig } from "../../data/adminPromotions";
import { useMoney } from "../../components/promotions/PromoBadges";
import { FormSection, Notice, PrototypeBar, Segmented, UnitInput } from "../../components/promotions/PromoUi";
import { GiftCardVisual } from "../../components/promotions/Visuals";
import { PreviewFrame } from "../../components/promotions/StorefrontPreviews";
import { useAdminShell } from "./AdminLayout";

/**
 * The gift card as a product: what a customer can choose on `/carte-cadeau`.
 *
 * Everything here feeds the storefront page directly (same store), so the
 * preview on the right is the real component the customer sees, and "View on
 * storefront" opens the page with these settings applied.
 *
 * Denominations are reordered with explicit move up / move down buttons — the
 * keyboard path — and by dragging the grip on a pointer device. The order on
 * this list is the order of the amount buttons in the shop.
 */
export function GiftCardSettings() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const l = useLocalized();
  const money = useMoney();
  const { openNav } = useAdminShell();
  const { showToast } = useToast();
  const store = usePromotions();
  const [draft, setDraft] = useState<GiftCardProductConfig>(store.config);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lang, setLang] = useState<ContentLang>("fr");
  const [newAmount, setNewAmount] = useState("");
  const [previewAmount, setPreviewAmount] = useState<number | null>(null);
  const [announce, setAnnounce] = useState("");
  const dragFrom = useRef<number | null>(null);

  const set = (patch: Partial<GiftCardProductConfig>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
  };

  const errors = useMemo(() => {
    const e: string[] = [];
    if (draft.amounts.length === 0) e.push(t("promo.config.errors.noAmount"));
    if (draft.allowCustomAmount && draft.minCents >= draft.maxCents) e.push(t("promo.config.errors.minMax"));
    if (!draft.designs.some((d) => d.enabled)) e.push(t("promo.config.errors.noDesign"));
    if (!draft.designs.find((d) => d.id === draft.defaultDesign)?.enabled) e.push(t("promo.config.errors.defaultDisabled"));
    return e;
  }, [draft, t]);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= draft.amounts.length) return;
    const next = [...draft.amounts];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    set({ amounts: next });
    setAnnounce(t("promo.config.moved", { amount: money(item), position: to + 1, total: next.length }));
  };

  const addAmount = () => {
    const cents = parseEuros(newAmount);
    if (!cents || draft.amounts.includes(cents)) return;
    set({ amounts: [...draft.amounts, cents] });
    setNewAmount("");
  };
  const newCents = parseEuros(newAmount);
  const newError = newAmount && (!newCents ? t("promo.config.errors.invalidAmount") : draft.amounts.includes(newCents) ? t("promo.config.errors.duplicate") : undefined);

  const save = async () => {
    if (errors.length) {
      showToast(t("promo.editor.toast.fix", { count: errors.length }), undefined, "error");
      return;
    }
    setSaving(true);
    await store.saveConfig(draft);
    setSaving(false);
    setDirty(false);
    showToast(t("promo.config.saved"), t("promo.config.savedBody"));
  };

  const fieldKeys = ["recipientName", "recipientEmail", "senderName", "message"] as const;
  const shown = previewAmount ?? draft.amounts[0] ?? null;

  return (
    <>
      <AdminHeader
        title={t("promo.config.title")}
        description={t("promo.config.description")}
        crumbs={[
          { label: t("admin.nav.promotions"), to: "/admin/promotions" },
          { label: t("promo.tabs.giftCards"), to: "/admin/promotions?vue=cartes-cadeaux" },
          { label: t("promo.config.crumb") },
        ]}
        onOpenNav={openNav}
        actions={
          <>
            <span><span className="hidden md:inline-flex"><AdminButton variant="ghost" iconLeft={ExternalLink} onClick={() => navigate("/carte-cadeau")} disabled={dirty}>
              {t("promo.cards.viewStore")}
            </AdminButton></span></span>
            <span><span className="hidden sm:inline-flex"><AdminButton variant="outline" iconLeft={RotateCcw} disabled={!dirty || saving} onClick={() => { setDraft(store.config); setDirty(false); }}>
              {t("promo.config.revert")}
            </AdminButton></span></span>
            <AdminButton variant="primary" iconLeft={Save} loading={saving} disabled={!dirty} onClick={save}>
              {t("promo.config.save")}
            </AdminButton>
          </>
        }
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 px-[var(--admin-gutter)] pb-[clamp(32px,5vw,56px)] pt-5">
        <PrototypeBar showModes={false} />
        {dirty && <Notice tone="info" title={t("promo.config.unsaved")}>{t("promo.config.unsavedBody")}</Notice>}
        {errors.length > 0 && (
          <Notice tone="error" title={t("promo.editor.invalidTitle", { count: errors.length })}>
            <ul className="m-0 list-disc pl-4">{errors.map((e) => <li key={e}>{e}</li>)}</ul>
          </Notice>
        )}

        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
          <div className="grid min-w-0 gap-4">
            <FormSection id="gc-product" letter="A" title={t("promo.config.product")}>
              <ToggleSwitch label={t("promo.config.publishedLabel")} description={draft.published ? t("promo.config.publishedOn") : t("promo.config.publishedOff")} checked={draft.published} onChange={(published) => set({ published })} />
              <FormField label={t("promo.config.titleField", { lang: lang.toUpperCase() })} aside={<Segmented label={t("promo.editor.contentLanguage")} hideLabel size="sm" value={lang} onChange={setLang} options={CONTENT_LANGS.map((c) => ({ value: c, label: c.toUpperCase() }))} />}>
                {(a) => <input {...a} lang={lang} type="text" value={draft.title[lang]} onChange={(e) => set({ title: { ...draft.title, [lang]: e.target.value } })} className="gt-admin-field" />}
              </FormField>
              <FormField label={t("promo.config.descriptionField", { lang: lang.toUpperCase() })}>
                {(a) => <textarea {...a} lang={lang} rows={3} value={draft.description[lang]} onChange={(e) => set({ description: { ...draft.description, [lang]: e.target.value } })} className="gt-admin-field" />}
              </FormField>
            </FormSection>

            <FormSection id="gc-amounts" letter="B" title={t("promo.config.amounts")} description={t("promo.config.amountsHint")} state={draft.amounts.length === 0 ? "issue" : undefined}>
              <p className="sr-only" aria-live="polite">{announce}</p>
              <ol className="m-0 grid list-none gap-1.5 p-0" aria-label={t("promo.config.amountsList")}>
                {draft.amounts.map((cents, i) => (
                  <li
                    key={cents}
                    draggable
                    onDragStart={() => (dragFrom.current = i)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (dragFrom.current != null) move(dragFrom.current, i);
                      dragFrom.current = null;
                    }}
                    className="gt-pop-in flex items-center gap-2 rounded-[var(--admin-radius-sm)] border border-[var(--border-subtle)] bg-[var(--admin-panel)] p-1.5 pl-2 transition-shadow hover:shadow-[var(--shadow-sm)]"
                  >
                    <GripVertical size={16} aria-hidden="true" className="cursor-grab text-[var(--text-subtle)]" />
                    <span className="w-6 text-center text-[11px] font-semibold tabular-nums text-[var(--text-muted)]">{i + 1}</span>
                    <span className="flex-1 text-[length:var(--text-body-md)] font-bold tabular-nums text-[var(--text-primary)]">{money(cents)}</span>
                    {i === 0 && <span className="rounded-[var(--radius-pill)] bg-[var(--gt-blue-100)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--gt-blue-700)]">{t("promo.config.preselected")}</span>}
                    <IconBtn label={t("promo.config.moveUp", { amount: money(cents) })} disabled={i === 0} onClick={() => move(i, i - 1)}><ArrowUp size={14} /></IconBtn>
                    <IconBtn label={t("promo.config.moveDown", { amount: money(cents) })} disabled={i === draft.amounts.length - 1} onClick={() => move(i, i + 1)}><ArrowDown size={14} /></IconBtn>
                    <IconBtn label={t("promo.config.remove", { amount: money(cents) })} danger onClick={() => set({ amounts: draft.amounts.filter((a) => a !== cents) })}><X size={14} /></IconBtn>
                  </li>
                ))}
              </ol>
              <div className="flex flex-wrap items-start gap-2">
                <div className="w-[160px]">
                  <FormField label={t("promo.config.addAmount")} error={newError || undefined}>
                    {(a) => (
                      <div onKeyDown={(e) => e.key === "Enter" && addAmount()}>
                        <UnitInput id={a.id} describedBy={a["aria-describedby"]} invalid={!!newError} unit="€" value={newAmount} onChange={setNewAmount} placeholder="250" />
                      </div>
                    )}
                  </FormField>
                </div>
                <AdminButton variant="outline" iconLeft={Plus} className="mt-[22px]" onClick={addAmount} disabled={!newCents || !!newError}>
                  {t("promo.config.add")}
                </AdminButton>
                <AdminButton variant="ghost" className="mt-[22px]" onClick={() => set({ amounts: [...draft.amounts].sort((a, b) => a - b) })}>
                  {t("promo.config.sortAsc")}
                </AdminButton>
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)] gap-4 border-t border-[var(--border-subtle)] pt-4">
                <ToggleSwitch label={t("promo.config.custom")} description={t("promo.config.customHint")} checked={draft.allowCustomAmount} onChange={(allowCustomAmount) => set({ allowCustomAmount })} />
                <div className={clsx("grid gap-4 sm:grid-cols-2", !draft.allowCustomAmount && "opacity-50")}>
                  <FormField label={t("promo.config.min")}>
                    {(a) => <UnitInput id={a.id} describedBy={a["aria-describedby"]} disabled={!draft.allowCustomAmount} unit="€" value={centsToInput(draft.minCents)} onChange={(v) => set({ minCents: parseEuros(v) ?? 0 })} />}
                  </FormField>
                  <FormField label={t("promo.config.max")} error={draft.allowCustomAmount && draft.minCents >= draft.maxCents ? t("promo.config.errors.minMax") : undefined}>
                    {(a) => <UnitInput id={a.id} describedBy={a["aria-describedby"]} invalid={a["aria-invalid"]} disabled={!draft.allowCustomAmount} unit="€" value={centsToInput(draft.maxCents)} onChange={(v) => set({ maxCents: parseEuros(v) ?? 0 })} />}
                  </FormField>
                </div>
              </div>
            </FormSection>

            <FormSection id="gc-rules" letter="C" title={t("promo.config.rules")}>
              <FormField label={t("promo.config.expiry")} hint={t("promo.config.expiryHint")}>
                {(a) => (
                  <AdminSelect
                    {...a}
                    value={draft.expiryMonths == null ? "none" : String(draft.expiryMonths)}
                    onChange={(e) => set({ expiryMonths: e.target.value === "none" ? null : Number(e.target.value) })}
                    options={[
                      { value: "12", label: t("promo.config.months", { count: 12 }) },
                      { value: "24", label: t("promo.config.months", { count: 24 }) },
                      { value: "36", label: t("promo.config.months", { count: 36 }) },
                      { value: "none", label: t("promo.config.noExpiry") },
                    ]}
                  />
                )}
              </FormField>
              <ToggleSwitch label={t("promo.config.scheduled")} description={t("promo.config.scheduledHint")} checked={draft.allowScheduledDelivery} onChange={(allowScheduledDelivery) => set({ allowScheduledDelivery })} />
              <div className="grid grid-cols-[minmax(0,1fr)] gap-3 border-t border-[var(--border-subtle)] pt-4">
                <h3 className="text-[length:var(--text-body-sm)]">{t("promo.config.fields")}</h3>
                {fieldKeys.map((key) => (
                  <div key={key} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[length:var(--text-body-sm)] font-medium">{t(`promo.config.field.${key}`)}</span>
                    {key === "recipientEmail" ? (
                      <span className="inline-flex items-center gap-1.5 text-[length:var(--text-caption)] text-[var(--text-muted)]">
                        <Check size={13} aria-hidden="true" /> {t("promo.config.emailLocked")}
                      </span>
                    ) : (
                      <Segmented
                        label={t(`promo.config.field.${key}`)}
                        hideLabel
                        size="sm"
                        value={draft.fields[key]}
                        onChange={(mode: FieldMode) => set({ fields: { ...draft.fields, [key]: mode } })}
                        options={(["required", "optional", "hidden"] as const).map((m) => ({ value: m, label: t(`promo.config.mode.${m}`) }))}
                      />
                    )}
                  </div>
                ))}
                <FormField label={t("promo.config.messageMax")}>
                  {(a) => (
                    <AdminSelect {...a} disabled={draft.fields.message === "hidden"} value={String(draft.messageMaxLength)} onChange={(e) => set({ messageMaxLength: Number(e.target.value) })} options={[140, 240, 400].map((n) => ({ value: String(n), label: t("promo.config.chars", { count: n }) }))} />
                  )}
                </FormField>
              </div>
            </FormSection>

            <FormSection id="gc-designs" letter="D" title={t("promo.config.designs")} description={t("promo.config.designsHint")}>
              <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 xl:grid-cols-3">
                {draft.designs.map((d) => {
                  const isDefault = draft.defaultDesign === d.id;
                  return (
                    <li key={d.id} className={clsx("grid gap-2 rounded-[var(--admin-radius)] border p-2.5 transition-colors", d.enabled ? "border-[var(--border-default)]" : "border-dashed border-[var(--border-default)] bg-[var(--admin-panel-sunken)]")}>
                      <div className={clsx(!d.enabled && "opacity-45 grayscale")}>
                        <GiftCardVisual design={d.id} amountCents={shown} size="sm" label={t("promo.design." + d.id)} />
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[length:var(--text-caption)] font-semibold">{t(`promo.design.${d.id}`)}</span>
                        <label className="inline-flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
                          <input type="radio" name="default-design" checked={isDefault} disabled={!d.enabled} onChange={() => set({ defaultDesign: d.id as GiftCardDesign })} className="h-3.5 w-3.5 accent-[var(--gt-ink-900)]" />
                          {t("promo.config.default")}
                        </label>
                      </div>
                      <ToggleSwitch label={d.enabled ? t("promo.config.offered") : t("promo.config.notOffered")} checked={d.enabled} onChange={(enabled) => set({ designs: draft.designs.map((x) => (x.id === d.id ? { ...x, enabled } : x)) })} />
                    </li>
                  );
                })}
              </ul>
            </FormSection>
          </div>

          <aside aria-label={t("promo.config.preview")} className="grid grid-cols-[minmax(0,1fr)] gap-3 xl:sticky xl:top-[calc(var(--admin-header-h)+16px)]">
            <h2 className="text-[length:var(--text-body-md)]">{t("promo.config.preview")}</h2>
            <PreviewFrame label="globaltoothgems.com/carte-cadeau">
              <div className="grid grid-cols-[minmax(0,1fr)] gap-4 bg-[radial-gradient(500px_260px_at_90%_0%,var(--gt-blue-100),transparent),var(--gt-white)] p-4">
                <GiftCardVisual design={draft.defaultDesign} amountCents={shown} recipient="Jade" sender="Manon" message={t("promo.config.sampleMessage")} size="md" />
                <div className="grid grid-cols-[minmax(0,1fr)] gap-1">
                  <strong className="text-[length:var(--text-body-md)] text-[var(--text-primary)]">{l(draft.title) || "—"}</strong>
                  <p className="m-0 line-clamp-3 text-[length:var(--text-caption)] text-[var(--text-body)]">{l(draft.description)}</p>
                </div>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("promo.config.previewAmounts")}>
                  {draft.amounts.map((c) => (
                    <button key={c} type="button" onClick={() => setPreviewAmount(c)} aria-pressed={shown === c} className={clsx("h-9 rounded-[var(--radius-pill)] border px-3.5 text-[length:var(--text-caption)] font-bold tabular-nums transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]", shown === c ? "border-[var(--gt-ink-900)] bg-[var(--gt-ink-900)] text-[var(--gt-white)]" : "border-[var(--border-default)] bg-[var(--gt-white)] hover:border-[var(--gt-ink-400)]")}>
                      {money(c)}
                    </button>
                  ))}
                  {draft.allowCustomAmount && <span className="inline-flex h-9 items-center rounded-[var(--radius-pill)] border border-dashed border-[var(--border-default)] px-3.5 text-[length:var(--text-caption)] font-semibold text-[var(--text-muted)]">{t("promo.config.otherAmount", { min: money(draft.minCents), max: money(draft.maxCents) })}</span>}
                </div>
                <p className="m-0 text-[11px] text-[var(--text-muted)]">
                  {draft.expiryMonths ? t("promo.config.validFor", { count: draft.expiryMonths }) : t("promo.config.noExpiry")}
                  {draft.allowScheduledDelivery ? ` · ${t("promo.config.canSchedule")}` : ""}
                </p>
                {!draft.published && <Notice tone="warning" title={t("promo.config.unpublishedPreview")} />}
              </div>
            </PreviewFrame>
            <AdminButton variant="outline" iconLeft={ExternalLink} onClick={() => navigate("/carte-cadeau")} disabled={dirty}>
              {dirty ? t("promo.config.saveFirst") : t("promo.cards.viewStore")}
            </AdminButton>
          </aside>
        </div>
      </div>
    </>
  );
}

function IconBtn({ label, onClick, disabled, danger, children }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={clsx(
        "grid h-8 w-8 place-items-center rounded-[6px] text-[var(--text-muted)] transition-colors disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]",
        danger ? "hover:bg-[var(--status-error-bg)] hover:text-[var(--status-error-fg)]" : "hover:bg-[var(--gt-ink-100)] hover:text-[var(--text-primary)]",
      )}
    >
      <span aria-hidden="true">{children}</span>
    </button>
  );
}
