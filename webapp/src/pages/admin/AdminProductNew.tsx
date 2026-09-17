import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { AdminHeader } from "../../components/admin/AdminHeader";
import { ProductForm, type SubmitIntent } from "../../components/admin/ProductForm";
import { useAdminCatalog } from "../../lib/adminCatalog";
import { useLocalized } from "../../lib/localized";
import { useToast } from "../../lib/toast";
import type { AdminProduct } from "../../data/adminCatalog";
import { useAdminShell } from "./AdminLayout";

/** Creation screen. The form is shared with editing; only the outcome differs. */
export function AdminProductNew() {
  const { t } = useTranslation();
  const L = useLocalized();
  const navigate = useNavigate();
  const { openNav } = useAdminShell();
  const { showToast } = useToast();
  const { products, createProduct, blankProduct } = useAdminCatalog();
  const [saving, setSaving] = useState(false);

  // Built once: rebuilding the shell on every render would reset the form under
  // the administrator's hands.
  const initial = useMemo(() => blankProduct(), [blankProduct]);
  const takenSkus = useMemo(() => products.map((p) => p.sku), [products]);

  const submit = async (draft: AdminProduct, intent: SubmitIntent) => {
    setSaving(true);
    const saved = await createProduct(draft);
    setSaving(false);
    showToast(
      intent === "publish" ? t("admin.toasts.createdPublishedTitle") : t("admin.toasts.createdDraftTitle"),
      t("admin.toasts.createdBody", { name: L(saved.name) }),
    );
    navigate("/admin/produits");
  };

  return (
    <>
      <AdminHeader
        title={t("admin.create.title")}
        description={t("admin.create.description")}
        crumbs={[
          { label: t("admin.nav.dashboard"), to: "/admin" },
          { label: t("admin.nav.products"), to: "/admin/produits" },
          { label: t("admin.create.crumb") },
        ]}
        onOpenNav={openNav}
      />

      <div className="px-[var(--admin-gutter)] pt-5">
        <ProductForm
          initial={initial}
          mode="create"
          takenSkus={takenSkus}
          saving={saving}
          onSubmit={submit}
          onCancel={() => navigate("/admin/produits")}
        />
      </div>
    </>
  );
}
