"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import { BellRing, CircleAlert, Hourglass, Lock, MailCheck, PackageCheck, PlugZap, Send, type LucideIcon } from "lucide-react";
import { Link } from "../../lib/navigation";
import { AdminHeader } from "../../components/admin/AdminHeader";
import { EmptyState } from "../../components/admin/EmptyState";
import { SearchInput } from "../../components/admin/SearchInput";
import { ErrorPanel, Panel, PromoKpi, Segmented } from "../../components/promotions/PromoUi";
import { Badge, type BadgeTone } from "../../components/ui/Badge";
import { useFormat } from "../../lib/format";
import { useAdminBackInStock } from "../../lib/adminBackInStock";
import {
  type BackInStockState,
  type BackInStockView,
  demandedProducts,
  figuresOf,
  filterRequests,
} from "../../lib/adminBackInStockMapping";
import { productEditPath } from "../../lib/adminProductLinks";
import { useAdminShell } from "./AdminLayout";

const STATE_BADGE: Record<BackInStockState, { tone: BadgeTone; icon: LucideIcon }> = {
  waiting: { tone: "neutral", icon: Hourglass },
  due: { tone: "brand", icon: Send },
  paused: { tone: "warning", icon: CircleAlert },
  failed: { tone: "error", icon: CircleAlert },
  notified: { tone: "success", icon: MailCheck },
};

const headCell =
  "sticky top-0 z-10 border-b border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)]";
const linkClass =
  "font-semibold text-[var(--text-primary)] underline decoration-[var(--border-default)] underline-offset-2 hover:decoration-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]";

/**
 * Back-in-stock alerts (decision 90): who asked to be told when a product comes
 * back, what is waiting, what leaves at the next run of the e-mail sweep, what
 * went out, and what is stuck. Read-only — the requests are made by customers on
 * the product pages and closed by the e-mail itself. The products most asked for
 * come first: they are the ones worth restocking.
 */
export function AdminBackInStock() {
  const { t } = useTranslation();
  const { formatDateShort, formatCount } = useFormat();
  const { openNav } = useAdminShell();
  const { requests, state, retry } = useAdminBackInStock();
  const [view, setView] = useState<BackInStockView>("open");
  const [query, setQuery] = useState("");

  const figures = useMemo(() => figuresOf(requests), [requests]);
  const demand = useMemo(() => demandedProducts(requests), [requests]);
  const shown = useMemo(() => filterRequests(requests, view, query), [requests, view, query]);
  const loading = state === "loading";

  return (
    <>
      <AdminHeader
        title={t("admin.backInStock.title")}
        description={t("admin.backInStock.description")}
        crumbs={[{ label: t("admin.nav.dashboard"), to: "/admin" }, { label: t("admin.nav.backInStock") }]}
        onOpenNav={openNav}
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 px-[var(--admin-gutter)] pb-[clamp(32px,5vw,56px)] pt-5">
        {state === "unavailable" ? (
          <div className="gt-admin-panel">
            <EmptyState icon={PlugZap} title={t("admin.backInStock.unavailableTitle")} body={t("admin.backInStock.unavailableBody")} />
          </div>
        ) : state === "forbidden" ? (
          <div className="gt-admin-panel">
            <EmptyState icon={Lock} title={t("admin.backInStock.forbiddenTitle")} body={t("admin.backInStock.forbiddenBody")} />
          </div>
        ) : state === "error" ? (
          <ErrorPanel
            title={t("admin.backInStock.errorTitle")}
            body={t("admin.backInStock.errorBody")}
            onRetry={retry}
            retryLabel={t("admin.backInStock.retry")}
          />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <PromoKpi icon={Hourglass} tone="neutral" loading={loading} value={formatCount(figures.waiting)}
                label={t("admin.backInStock.kpiWaiting")} hint={t("admin.backInStock.kpiWaitingHint")} />
              <PromoKpi icon={Send} tone="brand" loading={loading} value={formatCount(figures.due)}
                label={t("admin.backInStock.kpiDue")} hint={t("admin.backInStock.kpiDueHint")} />
              <PromoKpi icon={MailCheck} tone="success" loading={loading} value={formatCount(figures.notified)}
                label={t("admin.backInStock.kpiNotified")} hint={t("admin.backInStock.kpiNotifiedHint")} />
              <PromoKpi icon={CircleAlert} tone={figures.attention > 0 ? "warning" : "neutral"} loading={loading}
                value={formatCount(figures.attention)} label={t("admin.backInStock.kpiAttention")}
                hint={t("admin.backInStock.kpiAttentionHint")} />
            </div>

            {!loading && demand.length > 0 && (
              <Panel title={t("admin.backInStock.demandTitle")} icon={PackageCheck}>
                <ol className="m-0 grid list-none gap-0 p-0">
                  {demand.map((item) => (
                    <li
                      key={`${item.productId}:${item.variantName ?? ""}`}
                      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-[var(--border-subtle)] py-2.5 last:border-b-0"
                    >
                      <span className="min-w-0">
                        <Link to={productEditPath(item.productId)} className={linkClass}>
                          {item.productName}
                        </Link>
                        {item.variantName && <span className="text-[var(--text-muted)]"> · {item.variantName}</span>}
                      </span>
                      <span className="flex items-center gap-2 text-[length:var(--text-body-sm)]">
                        {item.back && (
                          <Badge size="sm" tone="brand" icon={Send}>
                            {t("admin.backInStock.state.due")}
                          </Badge>
                        )}
                        <strong className="tabular-nums">{t("admin.backInStock.demandCount", { count: item.open })}</strong>
                      </span>
                    </li>
                  ))}
                </ol>
              </Panel>
            )}

            <section className="gt-admin-panel grid grid-cols-[minmax(0,1fr)] gap-0 overflow-hidden">
              <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--border-subtle)] p-4">
                <Segmented<BackInStockView>
                  label={t("admin.backInStock.viewLabel")}
                  hideLabel
                  value={view}
                  onChange={setView}
                  options={[
                    { value: "open", label: t("admin.backInStock.viewOpen") },
                    { value: "notified", label: t("admin.backInStock.viewNotified") },
                    { value: "all", label: t("admin.backInStock.viewAll") },
                  ]}
                />
                <div className="w-full sm:w-[320px]">
                  <SearchInput
                    id="back-in-stock-search"
                    value={query}
                    onChange={setQuery}
                    label={t("admin.backInStock.searchLabel")}
                    placeholder={t("admin.backInStock.searchPlaceholder")}
                    clearLabel={t("admin.backInStock.searchClear")}
                  />
                </div>
              </div>

              {loading ? (
                <div role="status" aria-live="polite" className="grid gap-3 p-4">
                  <span className="sr-only">{t("admin.backInStock.loading")}</span>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="gt-skeleton h-10 rounded-[var(--admin-radius-sm)]" />
                  ))}
                </div>
              ) : shown.length === 0 ? (
                <EmptyState
                  icon={BellRing}
                  title={requests.length === 0 ? t("admin.backInStock.emptyTitle") : t("admin.backInStock.noMatchTitle")}
                  body={requests.length === 0 ? t("admin.backInStock.emptyBody") : t("admin.backInStock.noMatchBody")}
                />
              ) : (
                <div className="gt-admin-scroll max-h-[min(72vh,900px)] overflow-auto">
                  <table className="w-full min-w-[860px] table-fixed border-collapse text-[length:var(--text-body-sm)]">
                    <caption className="sr-only">{t("admin.backInStock.tableCaption")}</caption>
                    <colgroup>
                      <col style={{ width: "30%" }} />
                      <col style={{ width: "28%" }} />
                      <col style={{ width: "8%" }} />
                      <col style={{ width: "12%" }} />
                      <col style={{ width: "22%" }} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th scope="col" className={clsx(headCell, "pl-4")}>{t("admin.backInStock.colProduct")}</th>
                        <th scope="col" className={headCell}>{t("admin.backInStock.colCustomer")}</th>
                        <th scope="col" className={headCell}>{t("admin.backInStock.colLanguage")}</th>
                        <th scope="col" className={headCell}>{t("admin.backInStock.colAsked")}</th>
                        <th scope="col" className={clsx(headCell, "pr-4")}>{t("admin.backInStock.colState")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map((request) => {
                        const badge = STATE_BADGE[request.state];
                        return (
                          <tr key={request.id} className="border-b border-[var(--border-subtle)] last:border-b-0">
                            <td className="py-3 pl-4 pr-3 align-middle">
                              <Link to={productEditPath(request.productId)} className={linkClass}>
                                {request.productName}
                              </Link>
                              {request.variantName && (
                                <span className="block truncate text-[length:var(--text-caption)] text-[var(--text-muted)]">
                                  {request.variantName}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-3 align-middle">
                              <span className="block truncate">{request.email}</span>
                              <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
                                {request.userId ? (
                                  <Link to={`/admin/clients/${request.userId}`} className="underline underline-offset-2">
                                    {t("admin.backInStock.member")}
                                  </Link>
                                ) : (
                                  t("admin.backInStock.visitor")
                                )}
                              </span>
                            </td>
                            <td className="px-3 py-3 align-middle uppercase text-[var(--text-muted)]">{request.locale}</td>
                            <td className="px-3 py-3 align-middle tabular-nums">{formatDateShort(request.createdAt)}</td>
                            <td className="py-3 pl-3 pr-4 align-middle">
                              <Badge size="sm" tone={badge.tone} icon={badge.icon}>
                                {t(`admin.backInStock.state.${request.state}`)}
                              </Badge>
                              <span className="mt-1 block text-[length:var(--text-caption)] text-[var(--text-muted)]">
                                {request.state === "notified" && request.notifiedAt
                                  ? t("admin.backInStock.notifiedOn", { date: formatDateShort(request.notifiedAt) })
                                  : t(`admin.backInStock.stateHint.${request.state}`)}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </>
  );
}
