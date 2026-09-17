import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Archive, PackageSearch, Trash2 } from "lucide-react";
import { AdminButton } from "../../components/admin/AdminButton";
import { AdminHeader } from "../../components/admin/AdminHeader";
import { ConfirmationDialog } from "../../components/admin/ConfirmationDialog";
import { EmptyState } from "../../components/admin/EmptyState";
import { ProductStatusBadge } from "../../components/admin/ProductStatusBadge";
import { ProductForm, type SubmitIntent } from "../../components/admin/ProductForm";
import { useAdminCatalog } from "../../lib/adminCatalog";
import { useLocalized } from "../../lib/localized";
import { useToast } from "../../lib/toast";
import { displayState, type AdminProduct } from "../../data/adminCatalog";
import { useAdminShell } from "./AdminLayout";

/**
 * Edit screen.
 *
 * Same form as creation, pre-populated, plus the two things that only exist
 * once a product does: its current state in the header, and the destructive
 * actions — both behind a confirmation.
 */
export function AdminProductEdit() {
  const { t } = useTranslation();
  const L = useLocalized();
  const navigate = useNavigate();
  const { id } = useParams();
  const { openNav } = useAdminShell();
  const { showToast } = useToast();
  const { products, loading, getProduct, updateProduct, setStatus, deleteProduct } = useAdminCatalog();

  const [saving, setSaving] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pending, setPending] = useState(false);

  const product = id ? getProduct(id) : undefined;
  const takenSkus = useMemo(() => products.filter((p) => p.id !== id).map((p) => p.sku), [products, id]);

  if (!product) {
    return (
      <>
        <AdminHeader
          title={t("admin.edit.missingTitle")}
          crumbs={[
            { label: t("admin.nav.dashboard"), to: "/admin" },
            { label: t("admin.nav.products"), to: "/admin/produits" },
          ]}
          onOpenNav={openNav}
        />
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

  const submit = async (draft: AdminProduct, intent: SubmitIntent) => {
    setSaving(true);
    await updateProduct(draft.id, draft);
    setSaving(false);
    showToast(
      t("admin.toasts.updatedTitle"),
      intent === "draft"
        ? t("admin.toasts.updatedDraftBody", { name: L(draft.name) })
        : t("admin.toasts.updatedBody", { name: L(draft.name) }),
    );
    navigate("/admin/produits");
  };

  const confirmArchive = async () => {
    setPending(true);
    await setStatus(product.id, "archived");
    setPending(false);
    setArchiveOpen(false);
    showToast(t("admin.toasts.archivedTitle"), t("admin.toasts.archivedBody", { name: L(product.name) }), "info");
    navigate("/admin/produits");
  };

  const confirmDelete = async () => {
    setPending(true);
    await deleteProduct(product.id);
    setPending(false);
    setDeleteOpen(false);
    showToast(t("admin.toasts.deletedTitle"), t("admin.toasts.deletedBody", { name: L(product.name) }), "warning");
    navigate("/admin/produits");
  };

  return (
    <>
      <AdminHeader
        title={L(product.name)}
        description={product.sku}
        crumbs={[
          { label: t("admin.nav.dashboard"), to: "/admin" },
          { label: t("admin.nav.products"), to: "/admin/produits" },
          { label: L(product.name) },
        ]}
        onOpenNav={openNav}
        actions={
          <>
            <ProductStatusBadge state={displayState(product)} />
            <AdminButton variant="ghost" iconLeft={Trash2} onClick={() => setDeleteOpen(true)}>
              {t("admin.actions.delete")}
            </AdminButton>
          </>
        }
      />

      <div className="px-[var(--admin-gutter)] pt-5">
        {product.status === "archived" && (
          <p className="m-0 mb-4 flex flex-wrap items-center gap-2 rounded-[var(--admin-radius)] border border-[var(--border-default)] bg-[var(--gt-ink-100)] p-4 text-[length:var(--text-body-sm)] text-[var(--text-body)]">
            <Archive size={16} aria-hidden="true" className="flex-none" />
            {t("admin.edit.archivedNotice")}
            <Link
              to="/admin/produits?statut=archived"
              className="font-semibold underline decoration-[var(--border-default)] underline-offset-4 hover:decoration-[var(--text-primary)]"
            >
              {t("admin.edit.archivedLink")}
            </Link>
          </p>
        )}

        <ProductForm
          // Keyed by product: navigating from one product to another must load
          // the new one's values, not keep the previous draft in the fields.
          key={product.id}
          initial={product}
          mode="edit"
          takenSkus={takenSkus}
          saving={saving}
          onSubmit={submit}
          onCancel={() => navigate("/admin/produits")}
          onArchive={product.status === "archived" ? undefined : () => setArchiveOpen(true)}
        />
      </div>

      <ConfirmationDialog
        open={archiveOpen}
        icon={Archive}
        title={t("admin.dialog.archiveTitle")}
        body={
          <>
            <p className="m-0">{t("admin.dialog.archiveBody", { name: L(product.name) })}</p>
            <ul className="m-0 mt-2 grid list-disc gap-1 pl-5 text-[var(--text-muted)]">
              <li>{t("admin.dialog.archivePoint1")}</li>
              <li>{t("admin.dialog.archivePoint2")}</li>
            </ul>
          </>
        }
        confirmLabel={t("admin.actions.archive")}
        cancelLabel={t("common.cancel")}
        onConfirm={confirmArchive}
        onCancel={() => setArchiveOpen(false)}
        loading={pending}
      />

      <ConfirmationDialog
        open={deleteOpen}
        icon={Trash2}
        tone="danger"
        title={t("admin.dialog.deleteTitle")}
        body={
          <>
            <p className="m-0">{t("admin.dialog.deleteBody", { name: L(product.name) })}</p>
            <p className="m-0 mt-2 font-semibold text-[var(--status-error-fg)]">{t("admin.dialog.deleteWarning")}</p>
          </>
        }
        confirmLabel={t("admin.dialog.deleteConfirm")}
        cancelLabel={t("common.cancel")}
        confirmPhrase={product.sku}
        confirmPhraseLabel={t("admin.dialog.typeToConfirm", { phrase: product.sku })}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteOpen(false)}
        loading={pending}
      />
    </>
  );
}
