"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import { ArrowDown, ArrowUp, CircleAlert, Lock, MessageCircleQuestion, Plus, PlugZap, Save, Trash2, X } from "lucide-react";
import { useNavigate, useParams } from "../../lib/navigation";
import { AdminButton } from "../../components/admin/AdminButton";
import { AdminHeader } from "../../components/admin/AdminHeader";
import { AdminIconButton } from "../../components/admin/AdminIconButton";
import { AdminSelect } from "../../components/admin/AdminSelect";
import { ConfirmationDialog } from "../../components/admin/ConfirmationDialog";
import { EmptyState } from "../../components/admin/EmptyState";
import { FormField } from "../../components/admin/FormField";
import { SearchInput } from "../../components/admin/SearchInput";
import { ErrorPanel } from "../../components/promotions/PromoUi";
import { useAdminCatalog } from "../../lib/adminCatalog";
import { FaqWriteError, useAdminFaq } from "../../lib/adminFaq";
import {
  FAQ_LIMITS,
  isTranslated,
  newGroup,
  newItem,
  validateGroup,
  type AdminFaqGroup,
  type AdminFaqItem,
  type FaqStatus,
} from "../../lib/adminFaqMapping";
import { CONTENT_LANGS, useLocalized, type ContentLang } from "../../lib/localized";
import { useToast } from "../../lib/toast";
import { useAdminShell } from "./AdminLayout";

/** How many unselected products the picker lists at once (the search narrows it). */
const PRODUCT_PICKER_LIMIT = 40;

/**
 * One FAQ group: its name and status, its questions in French and English,
 * and where it is shown — categories and products. `/admin/faq/nouveau`
 * creates one; `/admin/faq/<id>` edits it. Saved in one transaction by
 * `admin_save_faq_group()`, which revalidates everything.
 */
export function AdminFaqEdit({ isNew = false }: { isNew?: boolean }) {
  const { t } = useTranslation();
  const { id } = useParams();
  const { openNav } = useAdminShell();
  const { groups, state, retry, save, remove } = useAdminFaq();
  const [fresh] = useState(() => newGroup(crypto.randomUUID()));

  const group = isNew ? fresh : groups.find((g) => g.id === id);
  const crumbs = [
    { label: t("admin.nav.dashboard"), to: "/admin" },
    { label: t("admin.nav.faq"), to: "/admin/faq" },
  ];

  if (state !== "ready" || !group) {
    const panel =
      state === "unavailable" ? (
        <EmptyState icon={PlugZap} title={t("admin.faq.unavailableTitle")} body={t("admin.faq.unavailableBody")} />
      ) : state === "forbidden" ? (
        <EmptyState icon={Lock} title={t("admin.faq.forbiddenTitle")} body={t("admin.faq.forbiddenBody")} />
      ) : state === "loading" ? (
        <div role="status" aria-live="polite" className="grid gap-3 p-5">
          <span className="sr-only">{t("admin.faq.loading")}</span>
          <div className="gt-skeleton h-10 rounded-[var(--admin-radius-sm)]" />
          <div className="gt-skeleton h-40 rounded-[var(--admin-radius-sm)]" />
        </div>
      ) : state === "ready" ? (
        <EmptyState icon={MessageCircleQuestion} title={t("admin.faq.missingTitle")} body={t("admin.faq.missingBody")} />
      ) : null;
    return (
      <>
        <AdminHeader title={t("admin.faq.title")} crumbs={crumbs} onOpenNav={openNav} />
        <div className="px-[var(--admin-gutter)] pt-5">
          {state === "error" ? (
            <ErrorPanel title={t("admin.faq.errorTitle")} body={t("admin.faq.errorBody")} onRetry={retry} retryLabel={t("admin.faq.retry")} />
          ) : (
            <div className="gt-admin-panel">{panel}</div>
          )}
        </div>
      </>
    );
  }

  return <GroupForm key={group.id} initial={group} isNew={isNew} crumbs={crumbs} save={save} remove={remove} />;
}

function GroupForm({
  initial,
  isNew,
  crumbs,
  save,
  remove,
}: {
  initial: AdminFaqGroup;
  isNew: boolean;
  crumbs: { label: string; to?: string }[];
  save: (group: AdminFaqGroup) => Promise<void>;
  remove: (id: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const L = useLocalized();
  const navigate = useNavigate();
  const { openNav } = useAdminShell();
  const { showToast } = useToast();
  const { categories, products } = useAdminCatalog();
  const [draft, setDraft] = useState<AdminFaqGroup>(initial);
  const [lang, setLang] = useState<ContentLang>("fr");
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [query, setQuery] = useState("");

  const errors = useMemo(() => validateGroup(draft), [draft]);
  const blocked = errors.group.length > 0;
  const update = (patch: Partial<AdminFaqGroup>) => setDraft((prev) => ({ ...prev, ...patch }));
  const setItem = (itemId: string, change: (item: AdminFaqItem) => AdminFaqItem) =>
    setDraft((prev) => ({ ...prev, items: prev.items.map((item) => (item.id === itemId ? change(item) : item)) }));
  const moveItem = (index: number, direction: -1 | 1) =>
    setDraft((prev) => {
      const items = [...prev.items];
      [items[index], items[index + direction]] = [items[index + direction], items[index]];
      return { ...prev, items };
    });
  const toggle = (key: "productIds" | "categoryIds", value: string) =>
    setDraft((prev) => ({
      ...prev,
      [key]: prev[key].includes(value) ? prev[key].filter((v) => v !== value) : [...prev[key], value],
    }));

  const productName = (productId: string) => {
    const product = products.find((p) => p.id === productId);
    return product ? L(product.name) : t("admin.faq.unknownProduct");
  };
  const selectedProducts = draft.productIds.filter((pid) => products.some((p) => p.id === pid));
  const pickable = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    return products
      .filter((p) => p.status !== "archived" && !draft.productIds.includes(p.id))
      .filter((p) => !q || `${p.name.fr} ${p.name.en} ${p.sku}`.toLocaleLowerCase().includes(q))
      .slice(0, PRODUCT_PICKER_LIMIT);
  }, [products, draft.productIds, query]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (blocked) return;
    setSaving(true);
    try {
      await save(draft);
    } catch (error) {
      const kind = error instanceof FaqWriteError ? error.kind : "error";
      showToast(t("admin.faq.toasts.errorTitle"), t(`admin.faq.toasts.${kind}Body`), "error");
      return;
    } finally {
      setSaving(false);
    }
    showToast(t("admin.faq.toasts.savedTitle"), t("admin.faq.toasts.savedBody", { name: draft.name.trim() }));
    navigate("/admin/faq");
  };

  const confirmDelete = async () => {
    setSaving(true);
    try {
      await remove(initial.id);
    } catch (error) {
      const kind = error instanceof FaqWriteError ? error.kind : "error";
      showToast(t("admin.faq.toasts.errorTitle"), t(`admin.faq.toasts.${kind}Body`), "error");
      return;
    } finally {
      setSaving(false);
      setDeleteOpen(false);
    }
    showToast(t("admin.faq.toasts.deletedTitle"), t("admin.faq.toasts.deletedBody", { name: initial.name }), "warning");
    navigate("/admin/faq");
  };

  const langSwitch = (
    <div role="group" aria-label={t("admin.form.contentLanguage")} className="flex gap-0.5 rounded-[var(--radius-pill)] bg-[var(--surface-sunken)] p-0.5">
      {CONTENT_LANGS.map((code) => {
        const active = lang === code;
        const missing = code !== "fr" && draft.items.some((item) => !isTranslated(item));
        return (
          <button
            key={code}
            type="button"
            onClick={() => setLang(code)}
            aria-pressed={active}
            className={clsx(
              "inline-flex items-center gap-1 rounded-[var(--radius-pill)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[var(--tracking-wide)] transition-colors",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--focus-ring)]",
              active ? "bg-[var(--gt-ink-900)] text-[var(--text-inverse)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]",
            )}
          >
            {code}
            {missing && (
              <>
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[var(--accent-highlight)]" />
                <span className="sr-only">{t("admin.form.translationMissing")}</span>
              </>
            )}
          </button>
        );
      })}
    </div>
  );

  const title = isNew ? t("admin.faq.newTitle") : initial.name;

  return (
    <>
      <AdminHeader
        title={title}
        crumbs={[...crumbs, { label: title }]}
        onOpenNav={openNav}
        actions={
          !isNew && (
            <AdminButton variant="ghost" iconLeft={Trash2} onClick={() => setDeleteOpen(true)}>
              {t("admin.faq.delete")}
            </AdminButton>
          )
        }
      />

      <form onSubmit={submit} noValidate className="grid gap-5 px-[var(--admin-gutter)] pb-28 pt-5">
        {submitted && blocked && (
          <div role="alert" className="m-0 grid gap-1 rounded-[var(--admin-radius)] border border-[var(--gt-red-400)] bg-[var(--status-error-bg)] p-4 text-[length:var(--text-body-sm)] text-[var(--status-error-fg)]">
            {errors.group.map((code) => (
              <p key={code} className="m-0 flex items-start gap-2">
                <CircleAlert size={16} aria-hidden="true" className="mt-0.5 flex-none" />
                {t(`admin.faq.errors.${code}`, { max: FAQ_LIMITS.items })}
              </p>
            ))}
          </div>
        )}

        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="grid min-w-0 gap-5">
            <Panel title={t("admin.faq.questionsTitle")} description={t("admin.faq.questionsBody")} aside={langSwitch}>
              {draft.items.length === 0 ? (
                <p className="m-0 rounded-[var(--admin-radius-sm)] bg-[var(--admin-panel-sunken)] p-4 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
                  {t("admin.faq.noQuestions")}
                </p>
              ) : (
                <ol className="m-0 grid list-none gap-4 p-0">
                  {draft.items.map((item, index) => {
                    const itemErrors = submitted ? errors.items[item.id] ?? [] : [];
                    return (
                      <li key={item.id} className="grid gap-3 rounded-[var(--admin-radius-sm)] border border-[var(--border-subtle)] p-4">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[length:var(--text-caption)] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)]">
                            {t("admin.faq.questionNumber", { n: index + 1 })}
                            {!isTranslated(item) && <span className="ml-2 normal-case tracking-normal">· {t("admin.faq.englishMissing")}</span>}
                          </span>
                          <span className="flex items-center gap-1">
                            <AdminIconButton icon={ArrowUp} label={t("admin.faq.questionUp", { n: index + 1 })} disabled={index === 0} onClick={() => moveItem(index, -1)} />
                            <AdminIconButton icon={ArrowDown} label={t("admin.faq.questionDown", { n: index + 1 })} disabled={index === draft.items.length - 1} onClick={() => moveItem(index, 1)} />
                            <AdminIconButton
                              icon={Trash2}
                              label={t("admin.faq.questionRemove", { n: index + 1 })}
                              onClick={() => update({ items: draft.items.filter((other) => other.id !== item.id) })}
                            />
                          </span>
                        </div>
                        <FormField
                          label={t("admin.faq.question", { lang: lang.toUpperCase() })}
                          required={lang === "fr"}
                          error={itemErrors.includes("question") ? t("admin.faq.errors.questionField", { max: FAQ_LIMITS.question }) : undefined}
                        >
                          {(props) => (
                            <input
                              {...props}
                              type="text"
                              maxLength={FAQ_LIMITS.question}
                              className="gt-admin-field"
                              value={item.question[lang]}
                              placeholder={lang === "en" ? item.question.fr : undefined}
                              onChange={(e) => setItem(item.id, (it) => ({ ...it, question: { ...it.question, [lang]: e.target.value } }))}
                            />
                          )}
                        </FormField>
                        <FormField
                          label={t("admin.faq.answer", { lang: lang.toUpperCase() })}
                          required={lang === "fr"}
                          error={itemErrors.includes("answer") ? t("admin.faq.errors.answerField", { max: FAQ_LIMITS.answer }) : undefined}
                        >
                          {(props) => (
                            <textarea
                              {...props}
                              rows={3}
                              maxLength={FAQ_LIMITS.answer}
                              className="gt-admin-field min-h-[88px] py-2"
                              value={item.answer[lang]}
                              placeholder={lang === "en" ? item.answer.fr : undefined}
                              onChange={(e) => setItem(item.id, (it) => ({ ...it, answer: { ...it.answer, [lang]: e.target.value } }))}
                            />
                          )}
                        </FormField>
                      </li>
                    );
                  })}
                </ol>
              )}
              <div>
                <AdminButton
                  variant="outline"
                  iconLeft={Plus}
                  disabled={draft.items.length >= FAQ_LIMITS.items}
                  onClick={() => update({ items: [...draft.items, newItem(crypto.randomUUID())] })}
                >
                  {t("admin.faq.addQuestion")}
                </AdminButton>
              </div>
              {lang === "en" && <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("admin.faq.englishHint")}</p>}
            </Panel>

            <Panel title={t("admin.faq.productsTitle")} description={t("admin.faq.productsBody")}>
              {selectedProducts.length > 0 && (
                <ul className="m-0 flex list-none flex-wrap gap-2 p-0" aria-label={t("admin.faq.selectedProducts")}>
                  {selectedProducts.map((pid) => (
                    <li key={pid}>
                      <button
                        type="button"
                        onClick={() => toggle("productIds", pid)}
                        aria-label={t("admin.faq.removeProduct", { name: productName(pid) })}
                        className="inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] border border-[var(--border-default)] bg-[var(--admin-panel)] py-1 pl-3 pr-2 text-[length:var(--text-body-sm)] hover:border-[var(--gt-ink-400)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
                      >
                        {productName(pid)}
                        <X size={14} aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <SearchInput
                id="faq-product-search"
                value={query}
                onChange={setQuery}
                label={t("admin.faq.productSearchLabel")}
                placeholder={t("admin.faq.productSearchPlaceholder")}
                clearLabel={t("admin.faq.productSearchClear")}
              />
              <fieldset className="m-0 grid max-h-[320px] gap-0 overflow-auto rounded-[var(--admin-radius-sm)] border border-[var(--border-subtle)] p-0">
                <legend className="sr-only">{t("admin.faq.productListLabel")}</legend>
                {pickable.length === 0 ? (
                  <p className="m-0 p-3 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">{t("admin.faq.noProductMatch")}</p>
                ) : (
                  pickable.map((product) => (
                    <label key={product.id} className="flex cursor-pointer items-center gap-3 border-b border-[var(--border-subtle)] px-3 py-2 text-[length:var(--text-body-sm)] last:border-b-0 hover:bg-[var(--admin-panel-sunken)]">
                      <input type="checkbox" checked={false} onChange={() => toggle("productIds", product.id)} />
                      <span className="min-w-0 flex-1 truncate">{L(product.name)}</span>
                      <span className="font-[family-name:var(--gt-font-mono)] text-[length:var(--text-caption)] text-[var(--text-muted)]">{product.sku}</span>
                    </label>
                  ))
                )}
              </fieldset>
            </Panel>
          </div>

          <div className="grid gap-5 xl:sticky xl:top-[calc(var(--admin-header-h)+20px)]">
            <Panel title={t("admin.faq.generalTitle")} compact>
              <FormField label={t("admin.faq.name")} hint={t("admin.faq.nameHint")} required error={submitted && errors.group.includes("name") ? t("admin.faq.errors.name") : undefined}>
                {(props) => (
                  <input {...props} type="text" maxLength={FAQ_LIMITS.name} className="gt-admin-field" value={draft.name} onChange={(e) => update({ name: e.target.value })} />
                )}
              </FormField>
              <FormField label={t("admin.faq.statusLabel")} hint={t(`admin.faq.statusHint.${draft.status}`)}>
                {(props) => (
                  <AdminSelect
                    {...props}
                    options={(["draft", "published"] as FaqStatus[]).map((s) => ({ value: s, label: t(`admin.faq.status.${s}`) }))}
                    value={draft.status}
                    onChange={(e) => update({ status: e.target.value as FaqStatus })}
                  />
                )}
              </FormField>
            </Panel>

            <Panel title={t("admin.faq.categoriesTitle")} description={t("admin.faq.categoriesBody")} compact>
              <fieldset className="m-0 grid gap-2 border-0 p-0">
                <legend className="sr-only">{t("admin.faq.categoriesTitle")}</legend>
                {categories.filter((c) => c.isActive !== false || draft.categoryIds.includes(c.id)).map((category) => (
                  <label key={category.id} className="flex cursor-pointer items-center gap-2.5 text-[length:var(--text-body-sm)]">
                    <input type="checkbox" checked={draft.categoryIds.includes(category.id)} onChange={() => toggle("categoryIds", category.id)} />
                    {L(category.name)}
                  </label>
                ))}
              </fieldset>
            </Panel>
          </div>
        </div>

        <div className="sticky bottom-0 z-10 -mx-[var(--admin-gutter)] flex flex-wrap justify-end gap-2 border-t border-[var(--border-subtle)] bg-[var(--admin-panel)] px-[var(--admin-gutter)] py-3">
          <AdminButton variant="ghost" onClick={() => navigate("/admin/faq")} disabled={saving}>
            {t("admin.faq.cancel")}
          </AdminButton>
          <AdminButton type="submit" variant="primary" iconLeft={Save} loading={saving}>
            {t("admin.faq.save")}
          </AdminButton>
        </div>
      </form>

      <ConfirmationDialog
        open={deleteOpen}
        title={t("admin.faq.deleteTitle")}
        body={t("admin.faq.deleteBody", { name: initial.name })}
        confirmLabel={t("admin.faq.deleteConfirm")}
        cancelLabel={t("admin.faq.cancel")}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteOpen(false)}
        tone="danger"
        icon={Trash2}
        loading={saving}
      />
    </>
  );
}

function Panel({
  title,
  description,
  aside,
  compact,
  children,
}: {
  title: string;
  description?: string;
  aside?: ReactNode;
  compact?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={clsx("gt-admin-panel grid gap-4", compact ? "p-4" : "p-5")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h2 className={compact ? "text-[length:var(--text-body-md)]" : "text-[length:var(--text-h4)]"}>{title}</h2>
          {description && <p className="m-0 max-w-[62ch] text-[length:var(--text-caption)] text-[var(--text-muted)]">{description}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}
