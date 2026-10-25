"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDown, ArrowUp, CircleCheck, Info, Lock, MessageCircleQuestion, PencilLine, Plus, PlugZap } from "lucide-react";
import { Link, useNavigate } from "../../lib/navigation";
import { AdminButton } from "../../components/admin/AdminButton";
import { AdminHeader } from "../../components/admin/AdminHeader";
import { AdminIconButton } from "../../components/admin/AdminIconButton";
import { EmptyState } from "../../components/admin/EmptyState";
import { ErrorPanel } from "../../components/promotions/PromoUi";
import { Badge } from "../../components/ui/Badge";
import { useAdminCatalog } from "../../lib/adminCatalog";
import { useAdminFaq } from "../../lib/adminFaq";
import { isTranslated, sortGroups } from "../../lib/adminFaqMapping";
import { useLocalized } from "../../lib/localized";
import { useToast } from "../../lib/toast";
import { useAdminShell } from "./AdminLayout";

const linkClass =
  "font-semibold text-[var(--text-primary)] underline decoration-[var(--border-default)] underline-offset-2 hover:decoration-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]";

/**
 * FAQ groups (decided by the owner on 2026-10-25): sets of questions written
 * once and assigned to products and categories, shown on the product pages.
 * The list says what each group holds, where it is shown and in which order
 * several groups appear on one page; editing happens on the group's page.
 */
export function AdminFaq() {
  const { t } = useTranslation();
  const L = useLocalized();
  const navigate = useNavigate();
  const { openNav } = useAdminShell();
  const { showToast } = useToast();
  const { categories, products } = useAdminCatalog();
  const { groups, state, retry, move } = useAdminFaq();
  const [moving, setMoving] = useState<string | null>(null);

  const ordered = sortGroups(groups);
  const categoryName = (id: string) => {
    const category = categories.find((c) => c.id === id);
    return category ? L(category.name) : t("admin.faq.unknownCategory");
  };

  const reorder = async (id: string, direction: -1 | 1) => {
    setMoving(id);
    try {
      await move(id, direction);
    } catch {
      showToast(t("admin.faq.toasts.errorTitle"), t("admin.faq.toasts.errorBody"), "error");
    } finally {
      setMoving(null);
    }
  };

  return (
    <>
      <AdminHeader
        title={t("admin.faq.title")}
        description={t("admin.faq.description")}
        crumbs={[{ label: t("admin.nav.dashboard"), to: "/admin" }, { label: t("admin.nav.faq") }]}
        onOpenNav={openNav}
        actions={
          state === "ready" && (
            <AdminButton variant="primary" iconLeft={Plus} onClick={() => navigate("/admin/faq/nouveau")}>
              {t("admin.faq.newGroup")}
            </AdminButton>
          )
        }
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 px-[var(--admin-gutter)] pb-[clamp(32px,5vw,56px)] pt-5">
        {state === "unavailable" ? (
          <div className="gt-admin-panel">
            <EmptyState icon={PlugZap} title={t("admin.faq.unavailableTitle")} body={t("admin.faq.unavailableBody")} />
          </div>
        ) : state === "forbidden" ? (
          <div className="gt-admin-panel">
            <EmptyState icon={Lock} title={t("admin.faq.forbiddenTitle")} body={t("admin.faq.forbiddenBody")} />
          </div>
        ) : state === "error" ? (
          <ErrorPanel title={t("admin.faq.errorTitle")} body={t("admin.faq.errorBody")} onRetry={retry} retryLabel={t("admin.faq.retry")} />
        ) : (
          <>
            <p className="m-0 flex items-start gap-2 rounded-[var(--admin-radius-sm)] bg-[var(--status-info-bg)] p-3 text-[length:var(--text-body-sm)] text-[var(--gt-blue-700)]">
              <Info size={16} aria-hidden="true" className="mt-0.5 flex-none" />
              {t("admin.faq.rule")}
            </p>

            <section className="gt-admin-panel grid grid-cols-[minmax(0,1fr)] gap-0 overflow-hidden">
              {state === "loading" ? (
                <div role="status" aria-live="polite" className="grid gap-3 p-4">
                  <span className="sr-only">{t("admin.faq.loading")}</span>
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="gt-skeleton h-16 rounded-[var(--admin-radius-sm)]" />
                  ))}
                </div>
              ) : ordered.length === 0 ? (
                <EmptyState
                  icon={MessageCircleQuestion}
                  title={t("admin.faq.emptyTitle")}
                  body={t("admin.faq.emptyBody")}
                  action={
                    <AdminButton variant="dark" iconLeft={Plus} onClick={() => navigate("/admin/faq/nouveau")}>
                      {t("admin.faq.newGroup")}
                    </AdminButton>
                  }
                />
              ) : (
                <ol className="m-0 grid list-none gap-0 p-0" aria-label={t("admin.faq.listLabel")}>
                  {ordered.map((group, index) => {
                    const translated = group.items.filter(isTranslated).length;
                    const productCount = group.productIds.filter((id) => products.some((p) => p.id === id)).length;
                    return (
                      <li
                        key={group.id}
                        className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 border-b border-[var(--border-subtle)] px-4 py-3.5 last:border-b-0"
                      >
                        <div className="grid min-w-0 gap-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link to={`/admin/faq/${group.id}`} className={linkClass}>
                              {group.name}
                            </Link>
                            <Badge size="sm" tone={group.status === "published" ? "success" : "neutral"} icon={group.status === "published" ? CircleCheck : PencilLine}>
                              {t(`admin.faq.status.${group.status}`)}
                            </Badge>
                          </div>
                          <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">
                            {t("admin.faq.questionCount", { count: group.items.length })}
                            {" · "}
                            {t("admin.faq.translatedCount", { count: translated, total: group.items.length })}
                          </p>
                          <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-body)]">
                            {group.categoryIds.length === 0 && productCount === 0
                              ? t("admin.faq.assignedNowhere")
                              : [
                                  ...group.categoryIds.map((id) => t("admin.faq.assignedCategory", { name: categoryName(id) })),
                                  ...(productCount > 0 ? [t("admin.faq.assignedProducts", { count: productCount })] : []),
                                ].join(" · ")}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <AdminIconButton
                            icon={ArrowUp}
                            label={t("admin.faq.moveUp", { name: group.name })}
                            disabled={index === 0 || moving !== null}
                            onClick={() => void reorder(group.id, -1)}
                          />
                          <AdminIconButton
                            icon={ArrowDown}
                            label={t("admin.faq.moveDown", { name: group.name })}
                            disabled={index === ordered.length - 1 || moving !== null}
                            onClick={() => void reorder(group.id, 1)}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
          </>
        )}
      </div>
    </>
  );
}
