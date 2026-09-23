import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { BadgeEuro, CircleDollarSign, ExternalLink, Gift, Hourglass, PiggyBank, Receipt, SearchX, Settings2, WalletCards } from "lucide-react";
import { AdminButton } from "../admin/AdminButton";
import { AdminSelect } from "../admin/AdminSelect";
import { SearchInput } from "../admin/SearchInput";
import { Pagination } from "../admin/Pagination";
import { usePromotions } from "../../lib/adminPromotions";
import { useToast } from "../../lib/toast";
import { paginate } from "../../lib/adminOrderFilters";
import {
  EMPTY_GIFT_CARD_FILTERS,
  filterGiftCards,
  giftCardMetrics,
  type GiftCardFilters,
} from "../../lib/promotionRules";
import { DELIVERY_STATUSES, GIFT_CARD_STATUSES, giftCardStatus, type GiftCard } from "../../data/adminPromotions";
import { GiftCardList, GiftCardsTable } from "./GiftCardsTable";
import { PromoEmpty } from "./PromoEmpty";
import { ErrorPanel, PromoKpi } from "./PromoUi";
import { useMoney } from "./PromoBadges";
import { GiftCardVisual } from "./Visuals";

/**
 * Gift cards in the back office: what was sold, what is still owed, and every
 * card with its balance. "Outstanding" is the number finance cares about — it
 * is a liability, money received for goods not yet delivered — so it gets its
 * own tile rather than being folded into revenue.
 */
export function GiftCardsView() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const money = useMoney();
  const store = usePromotions();
  const { giftCards, loading, demoMode, setDemoMode, config } = store;
  const [filters, setFilters] = useState<GiftCardFilters>(EMPTY_GIFT_CARD_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const m = useMemo(() => giftCardMetrics(giftCards), [giftCards]);
  const filtered = useMemo(() => filterGiftCards(giftCards, filters), [giftCards, filters]);
  const paged = paginate(filtered, page, pageSize);
  const set = (patch: Partial<GiftCardFilters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  };
  const active = (filters.query ? 1 : 0) + (filters.status !== "all" ? 1 : 0) + (filters.delivery !== "all" ? 1 : 0);

  const onCopy = async (card: GiftCard) => {
    try {
      await navigator.clipboard?.writeText(card.code);
    } catch {
      /* the toast still confirms the intent */
    }
    showToast(t("promo.toast.codeCopied"), card.code, "info");
  };
  const onResend = async (card: GiftCard) => {
    await store.resendGiftCard(card.code);
    showToast(t("promo.toast.resent", { email: card.recipientEmail }));
  };

  if (demoMode === "error")
    return <ErrorPanel title={t("promo.error.title")} body={t("promo.error.body")} retryLabel={t("promo.error.retry")} onRetry={() => setDemoMode("live")} />;

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <PromoKpi loading={loading} icon={Gift} tone="highlight" label={t("promo.cardsKpi.sold")} value={String(m.sold)} hint={t("promo.cardsKpi.soldHint")} />
        <PromoKpi loading={loading} icon={BadgeEuro} tone="success" label={t("promo.cardsKpi.revenue")} value={money(m.revenueCents)} hint={t("promo.cardsKpi.revenueHint")} />
        <PromoKpi loading={loading} icon={WalletCards} tone="brand" label={t("promo.cardsKpi.outstanding")} value={money(m.outstandingCents)} hint={t("promo.cardsKpi.outstandingHint")} />
        <PromoKpi loading={loading} icon={Receipt} tone="neutral" label={t("promo.cardsKpi.redeemed")} value={money(m.redeemedCents)} hint={t("promo.cardsKpi.redeemedHint")} />
        <PromoKpi loading={loading} icon={PiggyBank} tone="neutral" label={t("promo.cardsKpi.unredeemed")} value={money(m.unredeemedCents)} hint={t("promo.cardsKpi.unredeemedHint")} />
        <PromoKpi loading={loading} icon={Hourglass} tone="warning" label={t("promo.cardsKpi.expired")} value={String(m.expired)} hint={t("promo.cardsKpi.expiredHint", { amount: money(m.expiredValueCents) })} />
      </div>

      {/* The product itself: what customers buy, one click from its settings
          and from the page they buy it on. */}
      <section className="gt-admin-panel grid gap-4 p-4 sm:grid-cols-[180px_minmax(0,1fr)_auto] sm:items-center">
        <div className="w-[180px] max-w-full">
          <GiftCardVisual design={config.defaultDesign} amountCents={config.amounts[3] ?? config.amounts[0] ?? 5000} size="sm" label="" />
        </div>
        <div className="grid gap-1">
          <h2 className="text-[length:var(--text-body-md)]">{t("promo.cards.productTitle")}</h2>
          <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">
            {t("promo.cards.productSummary", {
              amounts: config.amounts.map((a) => money(a)).join(" · "),
              expiry: config.expiryMonths ? t("promo.config.months", { count: config.expiryMonths }) : t("promo.config.noExpiry"),
            })}
          </p>
          <p className="m-0 text-[length:var(--text-caption)] font-semibold">
            {config.published ? (
              <span className="text-[var(--status-success-fg)]">● {t("promo.config.published")}</span>
            ) : (
              <span className="text-[var(--status-warning-fg)]">○ {t("promo.config.unpublished")}</span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <AdminButton variant="dark" iconLeft={Settings2} onClick={() => navigate("/admin/promotions/cartes-cadeaux/configuration")}>
            {t("promo.cards.configure")}
          </AdminButton>
          <AdminButton variant="outline" iconLeft={ExternalLink} onClick={() => navigate("/carte-cadeau")}>
            {t("promo.cards.viewStore")}
          </AdminButton>
        </div>
      </section>

      {!loading && giftCards.length === 0 ? (
        <div className="gt-admin-panel">
          <PromoEmpty
            icon={CircleDollarSign}
            tone="highlight"
            title={t("promo.empty.noCards.title")}
            body={t("promo.empty.noCards.body")}
            actions={
              <AdminButton variant="primary" iconLeft={Settings2} onClick={() => navigate("/admin/promotions/cartes-cadeaux/configuration")}>
                {t("promo.cards.configure")}
              </AdminButton>
            }
          />
        </div>
      ) : (
        <>
          <div className="gt-admin-panel grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_200px_200px_200px] md:items-end">
            <SearchInput
              id="card-search"
              value={filters.query}
              onChange={(query) => set({ query })}
              label={t("promo.cards.search")}
              placeholder={t("promo.cards.search")}
              clearLabel={t("promo.filters.clearSearch")}
            />
            <label className="grid gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)]">{t("promo.cards.status")}</span>
              <AdminSelect
                value={filters.status}
                onChange={(e) => set({ status: e.target.value as GiftCardFilters["status"] })}
                options={[
                  { value: "all", label: t("promo.cards.allStatuses") },
                  ...GIFT_CARD_STATUSES.map((s) => ({
                    value: s,
                    label: `${t(`promo.cardStatus.${s}`)} (${giftCards.filter((c) => giftCardStatus(c) === s).length})`,
                  })),
                ]}
              />
            </label>
            <label className="grid gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)]">{t("promo.cards.delivery")}</span>
              <AdminSelect
                value={filters.delivery}
                onChange={(e) => set({ delivery: e.target.value as GiftCardFilters["delivery"] })}
                options={[{ value: "all", label: t("promo.cards.allDeliveries") }, ...DELIVERY_STATUSES.map((s) => ({ value: s, label: t(`promo.delivery.${s}`) }))]}
              />
            </label>
            <label className="grid gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)]">{t("promo.filters.sort")}</span>
              <AdminSelect
                value={filters.sort}
                onChange={(e) => set({ sort: e.target.value as GiftCardFilters["sort"] })}
                options={(["newest", "balance", "expiry"] as const).map((s) => ({ value: s, label: t(`promo.cards.sort.${s}`) }))}
              />
            </label>
            <div className="flex items-center justify-between gap-2 text-[length:var(--text-caption)] text-[var(--text-muted)] md:col-span-4">
              <span aria-live="polite">{t("promo.cards.results", { count: filtered.length })}</span>
              {active > 0 && (
                <AdminButton size="sm" variant="ghost" onClick={() => set(EMPTY_GIFT_CARD_FILTERS)}>
                  {t("promo.filters.reset", { count: active })}
                </AdminButton>
              )}
            </div>
          </div>

          {loading ? (
            <div className="gt-admin-panel grid gap-3 p-4" role="status" aria-label={t("promo.common.loading")}>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="gt-skeleton h-10 rounded-[var(--admin-radius-sm)]" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="gt-admin-panel">
              <PromoEmpty
                icon={SearchX}
                tone="neutral"
                compact
                title={t("promo.empty.noCardResults.title")}
                body={t("promo.empty.noCardResults.body")}
                actions={
                  <AdminButton variant="outline" onClick={() => set(EMPTY_GIFT_CARD_FILTERS)}>
                    {t("promo.filters.resetShort")}
                  </AdminButton>
                }
              />
            </div>
          ) : (
            <>
              <GiftCardsTable cards={paged.items} onCopy={onCopy} onResend={onResend} />
              <GiftCardList cards={paged.items} onCopy={onCopy} onResend={onResend} />
              <Pagination
                page={paged}
                onPage={setPage}
                pageSize={pageSize}
                onPageSize={(s) => {
                  setPageSize(s);
                  setPage(1);
                }}
                rangeKey="promo.pagination.cardsRange"
                navLabelKey="promo.pagination.cardsLabel"
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
