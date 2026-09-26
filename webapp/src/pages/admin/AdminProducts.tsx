import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Archive, CircleAlert, Plus, RotateCcw, Trash2 } from "lucide-react";
import { AdminButton } from "../../components/admin/AdminButton";
import { AdminHeader } from "../../components/admin/AdminHeader";
import { ConfirmationDialog } from "../../components/admin/ConfirmationDialog";
import { ProductFilters } from "../../components/admin/ProductFilters";
import { ProductPreview } from "../../components/admin/ProductPreview";
import { ProductTable } from "../../components/admin/ProductTable";
import type { ProductRowActions } from "../../components/admin/ProductRow";
import { useAdminCatalog } from "../../lib/adminCatalog";
import { productEditPath } from "../../lib/adminProductLinks";
import { useLocalized } from "../../lib/localized";
import { useToast } from "../../lib/toast";
import {
  DEFAULT_FILTERS,
  SORT_KEYS,
  filterProducts,
  isFiltered,
  type ProductFilterState,
  type SortKey,
} from "../../lib/productFilters";
import {
  stockState,
  type AdminProduct,
  type CategoryId,
  type ProductStatus,
  type StockState,
} from "../../data/adminCatalog";
import { useAdminShell } from "./AdminLayout";

/**
 * Product management: the screen this prototype exists to get right.
 *
 * The page owns every consequence — which dialog opens, which toast fires,
 * where a click leads — while the table, the filters and the drawer stay
 * presentational. That split is what will let the store underneath be swapped
 * for a real API without any of those components changing.
 */
export function AdminProducts() {
  const { t, i18n } = useTranslation();
  const L = useLocalized();
  const navigate = useNavigate();
  const { openNav } = useAdminShell();
  const { showToast } = useToast();
  const { products, loading, loadError, reload, updateProduct, setStatus, duplicateProduct, deleteProduct } =
    useAdminCatalog();

  const [params, setParams] = useSearchParams();
  const [preview, setPreview] = useState<AdminProduct | null>(null);
  const [archiving, setArchiving] = useState<AdminProduct | null>(null);
  const [deleting, setDeleting] = useState<AdminProduct | null>(null);
  const [pending, setPending] = useState(false);

  /**
   * Filters live in the URL rather than in component state, so a filtered list
   * can be linked to, reloaded and stepped back through. The dashboard cards
   * rely on it: "3 out of stock" opens exactly those three.
   */
  const filters = useMemo<ProductFilterState>(
    () => ({
      search: params.get("q") ?? "",
      category: (params.get("categorie") as CategoryId | null) ?? "all",
      status: (params.get("statut") as ProductStatus | null) ?? "all",
      availability: (params.get("disponibilite") as StockState | null) ?? "all",
      sort: SORT_KEYS.includes(params.get("tri") as SortKey) ? (params.get("tri") as SortKey) : "newest",
    }),
    [params],
  );

  const setFilters = (next: ProductFilterState) => {
    const search = new URLSearchParams();
    if (next.search.trim()) search.set("q", next.search);
    if (next.category !== "all") search.set("categorie", next.category);
    if (next.status !== "all") search.set("statut", next.status);
    if (next.availability !== "all") search.set("disponibilite", next.availability);
    if (next.sort !== "newest") search.set("tri", next.sort);
    // Replace, not push: typing in the search box must not fill the history.
    setParams(search, { replace: true });
  };

  const visible = useMemo(
    () => filterProducts(products, filters, i18n.language),
    [products, filters, i18n.language],
  );

  // The drawer holds an id, not a snapshot: publishing from inside it must move
  // the badge the administrator is looking at.
  const previewProduct = preview ? (products.find((p) => p.id === preview.id) ?? null) : null;

  /**
   * Runs a catalogue write. A failure has already been reported by the store,
   * so the caller only needs to know whether to carry on with its success path.
   */
  const attempt = async (write: () => Promise<unknown>) => {
    try {
      await write();
      return true;
    } catch {
      return false;
    }
  };

  const actions: ProductRowActions = {
    onOpen: (product) => setPreview(product),
    onEdit: (product) => navigate(productEditPath(product.id)),
    onEditOption: (product, variant) => navigate(productEditPath(product.id, variant)),

    onDuplicate: async (product) => {
      let copy: AdminProduct | undefined;
      try {
        copy = await duplicateProduct(product.id);
      } catch {
        return;
      }
      if (copy) {
        showToast(t("admin.toasts.duplicatedTitle"), t("admin.toasts.duplicatedBody", { name: L(copy.name) }));
      }
    },

    onPublish: async (product) => {
      if (!(await attempt(() => setStatus(product.id, "active")))) return;
      showToast(t("admin.toasts.publishedTitle"), t("admin.toasts.publishedBody", { name: L(product.name) }));
    },

    onUnpublish: async (product) => {
      if (!(await attempt(() => setStatus(product.id, "draft")))) return;
      showToast(t("admin.toasts.unpublishedTitle"), t("admin.toasts.unpublishedBody", { name: L(product.name) }), "info");
    },

    onMarkOutOfStock: async (product) => {
      if (product.variantCount) {
        showToast(t("admin.toasts.variantStockTitle"), t("admin.toasts.variantStockBody"), "info");
        return;
      }
      // Tracked stock is a count, so the count is what changes; an untracked
      // product has no count and only its manual availability can move.
      const marked = await attempt(() =>
        updateProduct(
          product.id,
          product.trackInventory ? { stock: 0 } : { availability: "out_of_stock" },
          { fr: "Marqué en rupture", en: "Marked out of stock" },
        ),
      );
      if (!marked) return;
      showToast(t("admin.toasts.outOfStockTitle"), t("admin.toasts.outOfStockBody", { name: L(product.name) }), "warning");
    },

    onRestock: async (product) => {
      if (product.variantCount) {
        showToast(t("admin.toasts.variantStockTitle"), t("admin.toasts.variantStockBody"), "info");
        return;
      }
      if (!product.trackInventory) {
        const restocked = await attempt(() =>
          updateProduct(product.id, { availability: "in_stock" }, { fr: "Remis en vente", en: "Back on sale" }),
        );
        if (!restocked) return;
        showToast(t("admin.toasts.restockedTitle"), t("admin.toasts.restockedBody", { name: L(product.name) }));
        return;
      }
      // A quantity cannot be invented on the administrator's behalf, so this
      // hands over to the form rather than guessing one.
      showToast(t("admin.toasts.restockNeedsFormTitle"), t("admin.toasts.restockNeedsFormBody"), "info");
      navigate(`/admin/produits/${product.id}`);
    },

    onArchive: (product) => setArchiving(product),

    onRestore: async (product) => {
      // Restored as a draft, never straight back on sale: what took a product
      // out of the catalogue may still be true.
      if (!(await attempt(() => setStatus(product.id, "draft")))) return;
      showToast(t("admin.toasts.restoredTitle"), t("admin.toasts.restoredBody", { name: L(product.name) }));
    },

    onDelete: (product) => setDeleting(product),
  };

  const confirmArchive = async () => {
    if (!archiving) return;
    setPending(true);
    const archived = await attempt(() => setStatus(archiving.id, "archived"));
    setPending(false);
    if (!archived) return;
    showToast(t("admin.toasts.archivedTitle"), t("admin.toasts.archivedBody", { name: L(archiving.name) }), "info");
    setArchiving(null);
    if (preview?.id === archiving.id) setPreview(null);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setPending(true);
    const deleted = await attempt(() => deleteProduct(deleting.id));
    setPending(false);
    if (!deleted) return;
    showToast(t("admin.toasts.deletedTitle"), t("admin.toasts.deletedBody", { name: L(deleting.name) }), "warning");
    if (preview?.id === deleting.id) setPreview(null);
    setDeleting(null);
  };

  const filtered = isFiltered(filters);

  return (
    <>
      <AdminHeader
        title={t("admin.products.title")}
        description={t("admin.products.description")}
        crumbs={[{ label: t("admin.nav.dashboard"), to: "/admin" }, { label: t("admin.nav.products") }]}
        onOpenNav={openNav}
        actions={
          <AdminButton variant="primary" iconLeft={Plus} onClick={() => navigate("/admin/produits/nouveau")}>
            {t("admin.products.create")}
          </AdminButton>
        }
      />

      <div className="grid gap-4 px-[var(--admin-gutter)] pb-[clamp(32px,5vw,56px)] pt-5">
        {/* A failed load must not look like an empty catalogue. */}
        {loadError && !loading && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--admin-radius)] border border-[var(--gt-red-400)] bg-[var(--status-error-bg)] p-4 text-[length:var(--text-body-sm)] text-[var(--status-error-fg)]"
          >
            <span className="flex items-start gap-2.5">
              <CircleAlert size={16} aria-hidden="true" className="mt-0.5 flex-none" />
              {t("admin.errors.loadFailed")} {t(`admin.errors.${loadError}`)}
            </span>
            <AdminButton variant="outline" size="sm" iconLeft={RotateCcw} onClick={reload}>
              {t("admin.errors.retry")}
            </AdminButton>
          </div>
        )}

        <ProductFilters
          filters={filters}
          onChange={setFilters}
          resultCount={visible.length}
          totalCount={products.length}
        />

        <ProductTable
          products={visible}
          actions={actions}
          loading={loading}
          selectedId={previewProduct?.id}
          filtered={filtered}
          expandAlerts={filters.availability === "out_of_stock" || filters.availability === "low_stock"}
          emptyAction={
            filtered ? (
              <AdminButton variant="outline" onClick={() => setFilters(DEFAULT_FILTERS)}>
                {t("admin.filters.clear")}
              </AdminButton>
            ) : (
              <AdminButton variant="primary" iconLeft={Plus} onClick={() => navigate("/admin/produits/nouveau")}>
                {t("admin.products.create")}
              </AdminButton>
            )
          }
        />
      </div>

      <ProductPreview product={previewProduct} onClose={() => setPreview(null)} actions={actions} />

      <ConfirmationDialog
        open={archiving !== null}
        icon={Archive}
        title={t("admin.dialog.archiveTitle")}
        body={
          <>
            <p className="m-0">{t("admin.dialog.archiveBody", { name: archiving ? L(archiving.name) : "" })}</p>
            <ul className="m-0 mt-2 grid list-disc gap-1 pl-5 text-[var(--text-muted)]">
              <li>{t("admin.dialog.archivePoint1")}</li>
              <li>{t("admin.dialog.archivePoint2")}</li>
            </ul>
          </>
        }
        confirmLabel={t("admin.actions.archive")}
        cancelLabel={t("common.cancel")}
        onConfirm={confirmArchive}
        onCancel={() => setArchiving(null)}
        loading={pending}
      />

      <ConfirmationDialog
        open={deleting !== null}
        icon={Trash2}
        tone="danger"
        title={t("admin.dialog.deleteTitle")}
        body={
          <>
            <p className="m-0">{t("admin.dialog.deleteBody", { name: deleting ? L(deleting.name) : "" })}</p>
            <p className="m-0 mt-2 font-semibold text-[var(--status-error-fg)]">{t("admin.dialog.deleteWarning")}</p>
            {deleting && stockState(deleting) !== "out_of_stock" && (
              <p className="m-0 mt-2 text-[var(--text-muted)]">{t("admin.dialog.deleteStockNote")}</p>
            )}
          </>
        }
        confirmLabel={t("admin.dialog.deleteConfirm")}
        cancelLabel={t("common.cancel")}
        confirmPhrase={deleting?.sku}
        confirmPhraseLabel={deleting ? t("admin.dialog.typeToConfirm", { phrase: deleting.sku }) : undefined}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
        loading={pending}
      />
    </>
  );
}
