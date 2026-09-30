import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { CalendarCheck, CircleAlert, CircleCheck, MonitorSmartphone, Rocket, Save, SearchX, Undo2 } from "lucide-react";
import clsx from "clsx";
import { AdminButton } from "../../components/admin/AdminButton";
import { AdminHeader } from "../../components/admin/AdminHeader";
import { ConfirmationDialog } from "../../components/admin/ConfirmationDialog";
import { usePromotions } from "../../lib/adminPromotions";
import { useToast } from "../../lib/toast";
import { codeTaken as isCodeTaken, validatePromotion } from "../../lib/promotionRules";
import { blankPromotion, NOW_TIME, promotionStatus, toTime, type Promotion } from "../../data/adminPromotions";
import {
  BasicsSection,
  CodeSection,
  DiscountSection,
  EligibilitySection,
  ScheduleSection,
  UsageSection,
} from "../../components/promotions/EditorSections";
import { CodeTag, DiscountChip, PromotionStatusBadge, useDiscountLabel, usePromoDates } from "../../components/promotions/PromoBadges";
import { Notice, PrototypeBar } from "../../components/promotions/PromoUi";
import { PreviewFrame, PreviewProductCard, usePreviewProduct } from "../../components/promotions/StorefrontPreviews";
import { useScopeLabel } from "../../components/promotions/PromotionsTable";
import { PromoEmpty } from "../../components/promotions/PromoEmpty";
import { useAdminShell } from "./AdminLayout";

/**
 * Create or edit a promotion.
 *
 * A dedicated page rather than a drawer: six sections of rules deserve the
 * width, and a promotion being written is something a colleague may be sent to
 * ("can you check the dates on this one?"). The page is split in two:
 *
 * - **The form**, in six lettered, foldable sections — basics, discount,
 *   eligibility, usage, schedule, code — in the order an administrator thinks
 *   about an offer.
 * - **A sticky aside** that answers "what have I built?" continuously: the
 *   offer in one line, a checklist of what still blocks publishing (each item
 *   jumps to its section), and the product card exactly as a customer will see
 *   it.
 *
 * Saving a draft asks only for a name. Publishing asks for a valid promotion;
 * a failed attempt reveals every error at once, scrolls to the first one, and
 * says how many there are — never a silent disabled button.
 */
export function PromotionEditor() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams();
  const [params] = useSearchParams();
  const { openNav } = useAdminShell();
  const store = usePromotions();
  const existing = id ? store.getPromotion(id) : undefined;

  if (id && !existing) {
    return (
      <>
        <AdminHeader title={t("promo.notFound.promotion")} onOpenNav={openNav} crumbs={[{ label: t("admin.nav.promotions"), to: "/admin/promotions" }]} />
        <div className="px-[var(--admin-gutter)] pt-5">
          <div className="gt-admin-panel">
            <PromoEmpty
              icon={SearchX}
              tone="neutral"
              title={t("promo.notFound.promotion")}
              body={t("promo.notFound.promotionBody")}
              actions={<AdminButton variant="dark" onClick={() => navigate("/admin/promotions")}>{t("promo.common.backToList")}</AdminButton>}
            />
          </div>
        </div>
      </>
    );
  }

  return <EditorForm key={id ?? "new"} initial={existing ?? blankPromotion(params.get("campagne"))} isNew={!existing} />;
}

function EditorForm({ initial, isNew }: { initial: Promotion; isNew: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { openNav } = useAdminShell();
  const { showToast } = useToast();
  const store = usePromotions();
  const discount = useDiscountLabel();
  const scope = useScopeLabel();
  const { dateTime } = usePromoDates();

  const [draft, setDraft] = useState<Promotion>(initial);
  const [dirty, setDirty] = useState(false);
  // An existing promotion that is already broken shows its errors at once —
  // hiding them until "Publish" would make the invalid state look fine.
  const [showErrors, setShowErrors] = useState(!isNew && validatePromotion(initial).length > 0);
  const [saving, setSaving] = useState<"draft" | "publish" | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);

  const update = (recipe: (p: Promotion) => Promotion) => {
    setDraft((prev) => recipe(prev));
    setDirty(true);
  };

  const issues = useMemo(() => validatePromotion(draft), [draft]);
  const taken = draft.code.mode === "code" && isCodeTaken(draft.code.code, store.promotions, draft.id);
  const blocking = issues.length + (taken ? 1 : 0);
  const product = usePreviewProduct(draft);
  const campaign = draft.campaignId ? store.getCampaign(draft.campaignId) : null;

  const startsInFuture = toTime(draft.schedule.startsAt) > NOW_TIME;
  const publishLabel = startsInFuture ? t("promo.editor.schedulePublish") : t("promo.editor.activate");
  const currentStatus = promotionStatus(draft);

  const jump = (section: string) => {
    const node = document.getElementById(`section-${section}`);
    node?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    node?.querySelector<HTMLElement>("button[aria-expanded]")?.focus({ preventScroll: true });
  };

  const save = async (mode: "draft" | "publish") => {
    if (mode === "draft" && !draft.name.trim()) {
      setShowErrors(true);
      jump("basics");
      showToast(t("promo.editor.toast.nameNeeded"), undefined, "error");
      return;
    }
    if (mode === "publish" && blocking > 0) {
      setShowErrors(true);
      const first = issues[0]?.section ?? "code";
      jump(first);
      showToast(t("promo.editor.toast.fix", { count: blocking }), t("promo.editor.toast.fixBody"), "error");
      return;
    }
    setSaving(mode);
    const saved = await store.savePromotion({
      ...draft,
      lifecycle: mode === "draft" ? (isNew ? "draft" : draft.lifecycle === "live" ? "live" : draft.lifecycle) : "live",
    });
    setSaving(null);
    setDirty(false);
    showToast(
      mode === "draft"
        ? t("promo.editor.toast.saved", { name: saved.name })
        : startsInFuture
          ? t("promo.editor.toast.scheduled", { name: saved.name })
          : t("promo.editor.toast.activated", { name: saved.name }),
      mode === "publish" ? t("promo.editor.toast.publishedBody") : undefined,
    );
    navigate(`/admin/promotions/${saved.id}`);
  };

  const cancel = () => (dirty ? setLeaveOpen(true) : navigate(isNew ? "/admin/promotions" : `/admin/promotions/${draft.id}`));

  const sectionsNav = ["basics", "discount", "eligibility", "usage", "schedule", "code"] as const;

  return (
    <>
      <AdminHeader
        title={isNew ? t("promo.editor.titleNew") : t("promo.editor.titleEdit", { name: initial.name })}
        description={isNew ? t("promo.editor.descriptionNew") : t("promo.editor.descriptionEdit")}
        crumbs={[
          { label: t("admin.nav.promotions"), to: "/admin/promotions" },
          ...(isNew ? [] : [{ label: initial.name, to: `/admin/promotions/${initial.id}` }]),
          { label: isNew ? t("promo.editor.crumbNew") : t("promo.editor.crumbEdit") },
        ]}
        onOpenNav={openNav}
        actions={
          <span className="hidden items-center gap-2 md:flex">
            <AdminButton variant="ghost" onClick={cancel} disabled={!!saving}>
              {t("promo.common.cancel")}
            </AdminButton>
            <AdminButton variant="outline" iconLeft={Save} loading={saving === "draft"} disabled={!!saving} onClick={() => save("draft")}>
              {isNew || draft.lifecycle === "draft" ? t("promo.editor.saveDraft") : t("promo.editor.saveChanges")}
            </AdminButton>
            {(isNew || draft.lifecycle !== "live") && (
              <AdminButton variant="primary" iconLeft={startsInFuture ? CalendarCheck : Rocket} loading={saving === "publish"} disabled={!!saving} onClick={() => save("publish")}>
                {publishLabel}
              </AdminButton>
            )}
          </span>
        }
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 px-[var(--admin-gutter)] pb-28 pt-5 md:pb-[clamp(32px,5vw,56px)]">
        <PrototypeBar showModes={false} />

        {showErrors && blocking > 0 && (
          <Notice tone="error" title={t("promo.editor.invalidTitle", { count: blocking })}>
            {t("promo.editor.invalidBody")}
          </Notice>
        )}

        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="grid min-w-0 gap-4">
            {/* Section jump list: horizontal chips, handy on long forms and phones. */}
            <nav aria-label={t("promo.editor.sections")} className="gt-scroller -mx-1 px-1">
              <ol className="m-0 flex min-w-max list-none gap-1.5 p-0">
                {sectionsNav.map((s, i) => {
                  const bad = showErrors && issues.some((x) => x.section === s);
                  return (
                    <li key={s}>
                      <a
                        href={`#section-${s}`}
                        onClick={(e) => {
                          e.preventDefault();
                          jump(s);
                        }}
                        className={clsx(
                          "inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-pill)] border px-3 text-[length:var(--text-caption)] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]",
                          bad
                            ? "border-[var(--gt-red-400)] bg-[var(--status-error-bg)] text-[var(--status-error-fg)]"
                            : "border-[var(--border-default)] bg-[var(--admin-panel)] text-[var(--text-body)] hover:border-[var(--gt-ink-400)]",
                        )}
                      >
                        <span className="tabular-nums opacity-70">{String.fromCharCode(65 + i)}</span>
                        {t(`promo.editor.${s}.title`)}
                        {bad && <CircleAlert size={12} aria-label={t("promo.editor.sectionHasIssues")} />}
                      </a>
                    </li>
                  );
                })}
              </ol>
            </nav>

            <BasicsSection draft={draft} update={update} issues={issues} showErrors={showErrors} campaigns={store.campaigns.filter((c) => c.lifecycle !== "archived")} />
            <DiscountSection draft={draft} update={update} issues={issues} showErrors={showErrors} />
            <EligibilitySection draft={draft} update={update} issues={issues} showErrors={showErrors} />
            <UsageSection draft={draft} update={update} issues={issues} showErrors={showErrors} />
            <ScheduleSection draft={draft} update={update} issues={issues} showErrors={showErrors} />
            <CodeSection draft={draft} update={update} issues={issues} showErrors={showErrors} codeTaken={taken} />
          </div>

          {/* Summary aside: sticky on wide screens, after the form on narrow ones. */}
          <aside aria-label={t("promo.editor.summary")} className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:sticky xl:top-[calc(var(--admin-header-h)+16px)]">
            <section className="gt-admin-panel grid gap-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-[length:var(--text-body-md)]">{t("promo.editor.summary")}</h2>
                {!isNew && <PromotionStatusBadge status={currentStatus} />}
              </div>
              <p className="m-0 text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">{draft.name || t("promo.editor.untitled")}</p>
              <div className="flex flex-wrap items-center gap-2">
                <DiscountChip label={discount(draft)} />
                {draft.code.mode === "code" ? draft.code.code && <CodeTag code={draft.code.code} /> : <span className="text-[11px] text-[var(--text-muted)]">{t("promo.code.automatic")}</span>}
              </div>
              <dl className="m-0 grid gap-1.5 text-[length:var(--text-caption)]">
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--text-muted)]">{t("promo.table.scope")}</dt>
                  <dd className="m-0 text-right text-[var(--text-primary)]">{scope(draft)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--text-muted)]">{t("promo.table.start")}</dt>
                  <dd className="m-0 text-right text-[var(--text-primary)]">{draft.schedule.startsAt ? dateTime(draft.schedule.startsAt) : "—"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--text-muted)]">{t("promo.table.end")}</dt>
                  <dd className="m-0 text-right text-[var(--text-primary)]">{draft.schedule.endsAt ? dateTime(draft.schedule.endsAt) : t("promo.timeline.noEnd")}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--text-muted)]">{t("promo.table.campaign")}</dt>
                  <dd className="m-0 text-right text-[var(--text-primary)]">{campaign?.name ?? t("promo.table.standalone")}</dd>
                </div>
              </dl>
            </section>

            <section className="gt-admin-panel grid gap-2 p-4" aria-live="polite">
              <h2 className="text-[length:var(--text-body-sm)]">{t("promo.editor.checklist")}</h2>
              {blocking === 0 ? (
                <p className="m-0 flex items-center gap-2 text-[length:var(--text-caption)] font-semibold text-[var(--status-success-fg)]">
                  <CircleCheck size={15} aria-hidden="true" /> {t("promo.editor.readyToPublish")}
                </p>
              ) : (
                <ul className="m-0 grid list-none gap-1 p-0">
                  {issues.map((issue) => (
                    <li key={issue.key}>
                      <button
                        type="button"
                        onClick={() => {
                          setShowErrors(true);
                          jump(issue.section);
                        }}
                        className="flex w-full items-start gap-2 rounded-[6px] px-1.5 py-1 text-left text-[length:var(--text-caption)] text-[var(--text-body)] transition-colors hover:bg-[var(--status-error-bg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
                      >
                        <CircleAlert size={14} aria-hidden="true" className="mt-0.5 flex-none text-[var(--status-error-fg)]" />
                        {t(`promo.validation.${issue.key}`)}
                      </button>
                    </li>
                  ))}
                  {taken && (
                    <li className="flex items-start gap-2 px-1.5 py-1 text-[length:var(--text-caption)]">
                      <CircleAlert size={14} aria-hidden="true" className="mt-0.5 flex-none text-[var(--status-error-fg)]" />
                      {t("promo.validation.codeTaken")}
                    </li>
                  )}
                </ul>
              )}
            </section>

            {product && (
              <section className="gt-admin-panel grid gap-3 p-4">
                <PreviewFrame label={t("promo.editor.livePreview")}>
                  <div className="mx-auto w-full max-w-[260px] p-3">
                    <PreviewProductCard product={product} promotion={draft} campaign={campaign} />
                  </div>
                </PreviewFrame>
                {!isNew && (
                  <Link
                    to={`/admin/promotions/apercu?promotion=${draft.id}`}
                    className="inline-flex items-center gap-1.5 text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)] underline underline-offset-2 hover:text-[var(--accent-highlight-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
                  >
                    <MonitorSmartphone size={14} aria-hidden="true" /> {t("promo.editor.fullPreview")}
                  </Link>
                )}
              </section>
            )}
          </aside>
        </div>
      </div>

      {/* Phones and small tablets: the actions live in a bar pinned to the
          bottom edge, where the thumb already is. */}
      <div className="fixed inset-x-0 bottom-0 z-[80] flex gap-2 border-t border-[var(--border-subtle)] bg-[var(--admin-panel)]/95 px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))] backdrop-blur-[8px] md:hidden">
        <AdminButton variant="ghost" iconLeft={Undo2} onClick={cancel} aria-label={t("promo.common.cancel")} disabled={!!saving} />
        <AdminButton variant="outline" className="flex-1" loading={saving === "draft"} disabled={!!saving} onClick={() => save("draft")}>
          {t("promo.editor.saveDraftShort")}
        </AdminButton>
        {(isNew || draft.lifecycle !== "live") && (
          <AdminButton variant="primary" className="flex-1" loading={saving === "publish"} disabled={!!saving} onClick={() => save("publish")}>
            {publishLabel}
          </AdminButton>
        )}
      </div>

      <ConfirmationDialog
        open={leaveOpen}
        title={t("promo.dialogs.discard.title")}
        body={t("promo.dialogs.discard.body")}
        confirmLabel={t("promo.dialogs.discard.confirm")}
        cancelLabel={t("promo.dialogs.discard.keep")}
        tone="danger"
        onCancel={() => setLeaveOpen(false)}
        onConfirm={() => navigate(isNew ? "/admin/promotions" : `/admin/promotions/${draft.id}`)}
      />
    </>
  );
}
