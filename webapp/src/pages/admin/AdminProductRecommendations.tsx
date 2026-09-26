import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { Info, PackageSearch, PencilLine, RotateCcw, Save } from "lucide-react";
import { AdminButton } from "../../components/admin/AdminButton";
import { AdminHeader } from "../../components/admin/AdminHeader";
import { EmptyState } from "../../components/admin/EmptyState";
import { ProductStatusBadge } from "../../components/admin/ProductStatusBadge";
import { RecommendationList } from "../../components/admin/RecommendationList";
import { useAdminCatalog } from "../../lib/adminCatalog";
import { useLocalized } from "../../lib/localized";
import { useToast } from "../../lib/toast";
import { RECOMMENDATION_KINDS, STOREFRONT_RECOMMENDATION_SLOTS, displayState, type RecommendationKind } from "../../data/adminCatalog";
import { useAdminShell } from "./AdminLayout";

type Lists = Record<RecommendationKind, string[]>;

const sameLists = (a: Lists, b: Lists) =>
  RECOMMENDATION_KINDS.every((kind) => a[kind].length === b[kind].length && a[kind].every((id, i) => id === b[kind][i]));

/**
 * The products recommended next to one product: "Va avec" (complementary) and
 * alternatives (similar), each an ordered list.
 *
 * A route of its own rather than a section of the product form: the links are
 * saved apart from the product (their own table, their own permission check),
 * and a list reordered here should never ride along with a half-edited price.
 */
export function AdminProductRecommendations() {
  const { t } = useTranslation();
  const L = useLocalized();
  const navigate = useNavigate();
  const { id } = useParams();
  const { openNav } = useAdminShell();
  const { showToast } = useToast();
  const { loading, getProduct, recommendationsFor, saveRecommendations } = useAdminCatalog();

  const product = id ? getProduct(id) : undefined;
  const saved: Lists = {
    complementary: product ? recommendationsFor(product.id, "complementary") : [],
    similar: product ? recommendationsFor(product.id, "similar") : [],
  };
  // The draft belongs to one product: opening another one starts from its
  // saved lists, never from the previous product's edits.
  const [draft, setDraft] = useState<{ productId: string; lists: Lists } | null>(null);
  const [saving, setSaving] = useState(false);

  const lists = draft && draft.productId === product?.id ? draft.lists : saved;
  const dirty = !sameLists(lists, saved);

  const crumbs = [
    { label: t("admin.nav.dashboard"), to: "/admin" },
    { label: t("admin.nav.products"), to: "/admin/produits" },
  ];

  if (!product) {
    return (
      <>
        <AdminHeader title={t("admin.edit.missingTitle")} crumbs={crumbs} onOpenNav={openNav} />
        <div className="px-[var(--admin-gutter)] pt-5">
          <div className="gt-admin-panel">
            <EmptyState
              icon={PackageSearch}
              title={loading ? t("admin.edit.loadingTitle") : t("admin.edit.missingTitle")}
              body={loading ? t("admin.edit.loadingBody") : t("admin.edit.missingBody")}
              action={
                <AdminButton variant="outline" onClick={() => navigate("/admin/produits")}>
                  {t("admin.edit.backToList")}
                </AdminButton>
              }
            />
          </div>
        </div>
      </>
    );
  }

  const setList = (kind: RecommendationKind) => (ids: string[]) =>
    setDraft({ productId: product.id, lists: { ...lists, [kind]: ids } });

  const save = async () => {
    setSaving(true);
    await saveRecommendations(product.id, lists);
    setSaving(false);
    setDraft(null);
    showToast(t("admin.recommendations.savedTitle"), t("admin.recommendations.savedBody", { name: L(product.name) }));
  };

  return (
    <>
      <AdminHeader
        title={t("admin.recommendations.title")}
        description={L(product.name)}
        crumbs={[...crumbs, { label: L(product.name), to: `/admin/produits/${product.id}` }, { label: t("admin.recommendations.title") }]}
        onOpenNav={openNav}
        actions={
          <>
            <ProductStatusBadge state={displayState(product)} />
            <AdminButton variant="ghost" iconLeft={PencilLine} onClick={() => navigate(`/admin/produits/${product.id}`)}>
              {/* Icon only on a phone: the header's actions do not wrap. */}
              <span className="max-sm:sr-only">{t("admin.recommendations.editProduct")}</span>
            </AdminButton>
          </>
        }
      />

      <div className="grid gap-5 px-[var(--admin-gutter)] pb-28 pt-5">
        <p className="m-0 flex items-start gap-2 rounded-[var(--admin-radius-sm)] bg-[var(--status-info-bg)] p-3 text-[length:var(--text-caption)] text-[var(--gt-blue-700)]">
          <Info size={14} aria-hidden="true" className="mt-0.5 flex-none" />
          {t("admin.recommendations.intro", { count: STOREFRONT_RECOMMENDATION_SLOTS })}
        </p>

        {product.status !== "active" && (
          <p className="m-0 rounded-[var(--admin-radius)] border border-[var(--border-default)] bg-[var(--gt-ink-100)] p-4 text-[length:var(--text-body-sm)] text-[var(--text-body)]">
            {t("admin.recommendations.notOnSale")}
          </p>
        )}

        <div className="grid items-start gap-5 xl:grid-cols-2">
          <RecommendationList
            title={t("admin.recommendations.complementaryTitle")}
            description={t("admin.recommendations.complementaryDescription")}
            productId={product.id}
            ids={lists.complementary}
            onChange={setList("complementary")}
          />
          <RecommendationList
            title={t("admin.recommendations.similarTitle")}
            description={t("admin.recommendations.similarDescription")}
            productId={product.id}
            ids={lists.similar}
            onChange={setList("similar")}
          />
        </div>
      </div>

      {/* Same pinned action bar as the product form. */}
      <div className="fixed inset-x-0 bottom-0 z-[80] border-t border-[var(--border-subtle)] bg-[var(--admin-panel)]/95 backdrop-blur-[10px] lg:left-[var(--admin-rail-offset,0px)]">
        <div className="flex flex-wrap items-center justify-between gap-3 px-[var(--admin-gutter)] py-3">
          <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]" aria-live="polite">
            {dirty ? t("admin.form.unsaved") : t("admin.form.noChanges")}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <AdminButton variant="ghost" iconLeft={RotateCcw} onClick={() => setDraft(null)} disabled={!dirty || saving}>
              {t("admin.recommendations.discard")}
            </AdminButton>
            <AdminButton variant="primary" iconLeft={Save} loading={saving} disabled={!dirty} onClick={save}>
              {t("admin.form.saveChanges")}
            </AdminButton>
          </div>
        </div>
      </div>
    </>
  );
}
