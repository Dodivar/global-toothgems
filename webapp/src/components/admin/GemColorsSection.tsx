import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDown, ArrowUp, EyeOff, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { AdminButton } from "./AdminButton";
import { AdminIconButton } from "./AdminIconButton";
import { AdminSheet } from "./AdminSheet";
import { ConfirmationDialog } from "./ConfirmationDialog";
import { GemColorForm } from "./GemColorForm";
import { ColorSwatch } from "../ui/ColorSwatch";
import { useAdminCatalog } from "../../lib/adminCatalog";
import { useLocalized } from "../../lib/localized";
import { useToast } from "../../lib/toast";
import type { AdminGemColor, GemColorDraft } from "../../data/adminCatalog";

/**
 * The colours of the storefront gem filter: create, rename, translate,
 * reorder, hide and delete.
 *
 * Lives on the Catégories page because it is the same kind of work — the
 * catalogue's taxonomy, under the same `manage_products` permission — and a
 * colour is to a gem what a category is to a product: the way customers
 * narrow the shop down.
 *
 * A colour used by a product cannot be deleted (the product would silently
 * lose it): the delete button says so, and hiding the colour is the way to
 * take it out of the shop without touching the products.
 */
export function GemColorsSection() {
  const { t } = useTranslation();
  const L = useLocalized();
  const { showToast } = useToast();
  const { gemColors, products, saveGemColor, deleteGemColor, reorderGemColors, loading } = useAdminCatalog();
  const headingId = useId();

  // `null` = closed, `"new"` = creation, otherwise the colour being edited.
  const [editing, setEditing] = useState<AdminGemColor | "new" | null>(null);
  const [deleting, setDeleting] = useState<AdminGemColor | null>(null);
  const [busy, setBusy] = useState(false);

  const usage = (color: AdminGemColor) => products.filter((p) => p.color === color.slug).length;

  const submit = async (draft: GemColorDraft) => {
    const saved = await saveGemColor(draft);
    setEditing(null);
    showToast(
      draft.id ? t("admin.gemColors.toastSavedTitle") : t("admin.gemColors.toastCreatedTitle"),
      t("admin.gemColors.toastSavedBody", { name: L(saved.name) }),
    );
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await deleteGemColor(deleting.id);
      showToast(t("admin.gemColors.toastDeletedTitle"), t("admin.gemColors.toastSavedBody", { name: L(deleting.name) }), "warning");
      setDeleting(null);
    } catch {
      // Reported by the store.
    } finally {
      setBusy(false);
    }
  };

  const move = async (index: number, offset: -1 | 1) => {
    const ids = gemColors.map((c) => c.id);
    const target = index + offset;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    setBusy(true);
    try {
      await reorderGemColors(ids);
    } catch {
      // Reported by the store.
    } finally {
      setBusy(false);
    }
  };

  const editedColor = editing && editing !== "new" ? editing : undefined;

  return (
    <section aria-labelledby={headingId} id="couleurs" className="grid gap-4 scroll-mt-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid max-w-[64ch] gap-1">
          <h2 id={headingId} className="text-[length:var(--text-h4)]">
            {t("admin.gemColors.title")}
          </h2>
          <p className="m-0 text-[length:var(--text-caption)] leading-[var(--leading-normal)] text-[var(--text-muted)]">
            {t("admin.gemColors.description")}
          </p>
        </div>
        <AdminButton variant="dark" iconLeft={Plus} onClick={() => setEditing("new")}>
          {t("admin.gemColors.add")}
        </AdminButton>
      </div>

      <div className="gt-admin-panel overflow-hidden">
        {loading ? (
          <p className="m-0 p-5 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">{t("admin.gemColors.loading")}</p>
        ) : gemColors.length === 0 ? (
          <p className="m-0 p-5 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">{t("admin.gemColors.empty")}</p>
        ) : (
          <ul className="m-0 list-none divide-y divide-[var(--border-subtle)] p-0">
            {gemColors.map((color, index) => {
              const count = usage(color);
              const deleteBlocked = color.isMulticolor || count > 0;
              const name = L(color.name);
              return (
                <li key={color.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
                  <ColorSwatch color={color} size={32} />

                  <div className="grid min-w-[10rem] flex-1 gap-0.5">
                    <span className="flex flex-wrap items-center gap-2 text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">
                      {name}
                      {!color.isActive && (
                        <span className="inline-flex items-center gap-1 rounded-[var(--radius-pill)] bg-[var(--gt-ink-100)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-muted)]">
                          <EyeOff size={11} aria-hidden="true" />
                          {t("admin.gemColors.hidden")}
                        </span>
                      )}
                      {!color.name.en.trim() && (
                        <span className="rounded-[var(--radius-pill)] bg-[var(--status-warning-bg)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--status-warning-fg)]">
                          {t("admin.gemColors.missingEn")}
                        </span>
                      )}
                    </span>
                    <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
                      FR {color.name.fr} · EN {color.name.en || "—"}
                    </span>
                  </div>

                  <span className="w-[8.5rem] text-[length:var(--text-caption)] text-[var(--text-muted)]">
                    {color.isMulticolor ? (
                      <span className="inline-flex items-center gap-1">
                        <Sparkles size={12} aria-hidden="true" />
                        {t("admin.gemColors.multicolorShort")}
                      </span>
                    ) : (
                      <span className="font-[family-name:var(--gt-font-mono)] uppercase">{color.hex}</span>
                    )}
                  </span>

                  <span className="w-[6.5rem] text-[length:var(--text-caption)] tabular-nums text-[var(--text-muted)]">
                    {t("admin.gemColors.usage", { count })}
                  </span>

                  <div className="ml-auto flex items-center gap-0.5">
                    <AdminIconButton
                      icon={ArrowUp}
                      size="sm"
                      label={t("admin.gemColors.moveUp", { name })}
                      disabled={busy || index === 0}
                      onClick={() => move(index, -1)}
                    />
                    <AdminIconButton
                      icon={ArrowDown}
                      size="sm"
                      label={t("admin.gemColors.moveDown", { name })}
                      disabled={busy || index === gemColors.length - 1}
                      onClick={() => move(index, 1)}
                    />
                    <AdminIconButton
                      icon={Pencil}
                      size="sm"
                      label={t("admin.gemColors.edit", { name })}
                      onClick={() => setEditing(color)}
                    />
                    <AdminIconButton
                      icon={Trash2}
                      size="sm"
                      tone="danger"
                      label={
                        color.isMulticolor
                          ? t("admin.gemColors.deleteMulticolor")
                          : count > 0
                            ? t("admin.gemColors.deleteInUse", { name, count })
                            : t("admin.gemColors.delete", { name })
                      }
                      disabled={busy || deleteBlocked}
                      onClick={() => setDeleting(color)}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <AdminSheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editedColor ? t("admin.gemColors.editTitle", { name: L(editedColor.name) }) : t("admin.gemColors.newTitle")}
        description={t("admin.gemColors.sheetDescription")}
        closeLabel={t("admin.gemColors.cancel")}
        width={480}
      >
        {editing !== null && (
          <GemColorForm
            key={editedColor?.id ?? "new"}
            color={editedColor}
            onSubmit={submit}
            onCancel={() => setEditing(null)}
          />
        )}
      </AdminSheet>

      <ConfirmationDialog
        open={deleting !== null}
        icon={Trash2}
        tone="danger"
        title={t("admin.gemColors.deleteTitle")}
        body={<p className="m-0">{t("admin.gemColors.deleteBody", { name: deleting ? L(deleting.name) : "" })}</p>}
        confirmLabel={t("admin.gemColors.deleteConfirm")}
        cancelLabel={t("admin.gemColors.cancel")}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
        loading={busy}
      />
    </section>
  );
}
