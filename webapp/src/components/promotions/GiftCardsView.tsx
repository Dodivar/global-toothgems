import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "../../lib/navigation";
import { BadgeEuro, CircleDollarSign, ExternalLink, Gift, Hourglass, MailWarning, Plus, SearchX, Settings2, WalletCards } from "lucide-react";
import { AdminButton } from "../admin/AdminButton";
import { AdminSelect } from "../admin/AdminSelect";
import { FormField } from "../admin/FormField";
import { SearchInput } from "../admin/SearchInput";
import { Pagination } from "../admin/Pagination";
import { useToast } from "../../lib/toast";
import { paginate } from "../../lib/adminOrderFilters";
import { useAdminGiftCards } from "../../lib/giftCards/AdminGiftCardsProvider";
import {
  DELIVERY_STATUSES,
  EMPTY_GIFT_CARD_FILTERS,
  GIFT_CARD_STATUSES,
  filterGiftCards,
  giftCardMetrics,
  parseAmountInput,
  endOfDayIso,
  giftCardAdminPath,
  type GiftCardFilters,
} from "../../lib/giftCards/giftCardMapping";
import { GiftCardList, GiftCardsTable } from "./GiftCardsTable";
import { PromoEmpty } from "./PromoEmpty";
import { ErrorPanel, FormDialog, Notice, PromoKpi, UnitInput } from "./PromoUi";
import { useMoney } from "./PromoBadges";
import { GiftCardVisual } from "./Visuals";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Gift cards in the back office, read from the database: what was issued and
 * sold, what is still owed, and every card with its balance. "Outstanding" is
 * the number finance cares about — money received for goods not yet
 * delivered — so it gets its own tile rather than being folded into revenue.
 *
 * Codes are never shown: a card is its last 4 characters. Cards reach their
 * recipient by e-mail once the delivery function exists (not built yet: the
 * notice below says so rather than pretending).
 */
export function GiftCardsView() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const money = useMoney();
  const store = useAdminGiftCards();
  const { cards, settings, loading, failed, available, canManage } = store;
  const [filters, setFilters] = useState<GiftCardFilters>(EMPTY_GIFT_CARD_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [issuing, setIssuing] = useState(false);

  const currency = settings?.currency ?? "EUR";
  const m = useMemo(() => giftCardMetrics(cards, currency), [cards, currency]);
  const filtered = useMemo(() => filterGiftCards(cards, filters), [cards, filters]);
  const paged = paginate(filtered, page, pageSize);
  const set = (patch: Partial<GiftCardFilters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  };
  const active = (filters.query ? 1 : 0) + (filters.status !== "all" ? 1 : 0) + (filters.delivery !== "all" ? 1 : 0);
  const awaitingDelivery = cards.filter((c) => c.delivery === "pending" && (c.status === "active" || c.status === "partiallyRedeemed")).length;

  if (failed && !loading)
    return <ErrorPanel title={t("promo.error.title")} body={t("promo.gc.loadError")} retryLabel={t("promo.error.retry")} onRetry={() => void store.reload()} />;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      {!available && <Notice tone="info" title={t("promo.gc.offlineTitle")}>{t("promo.gc.offlineBody")}</Notice>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <PromoKpi loading={loading} icon={Gift} tone="highlight" label={t("promo.gc.kpi.issued")} value={String(m.issued)} hint={t("promo.gc.kpi.issuedHint")} />
        <PromoKpi loading={loading} icon={BadgeEuro} tone="success" label={t("promo.cardsKpi.revenue")} value={money(m.soldMinor)} hint={t("promo.gc.kpi.soldHint")} />
        <PromoKpi loading={loading} icon={WalletCards} tone="brand" label={t("promo.cardsKpi.outstanding")} value={money(m.outstandingMinor)} hint={t("promo.cardsKpi.outstandingHint")} />
        <PromoKpi loading={loading} icon={Hourglass} tone="warning" label={t("promo.cardsKpi.expired")} value={String(m.expired)} hint={t("promo.cardsKpi.expiredHint", { amount: money(m.expiredMinor) })} />
        <PromoKpi loading={loading} icon={MailWarning} tone="neutral" label={t("promo.gc.kpi.awaiting")} value={String(awaitingDelivery)} hint={t("promo.gc.kpi.awaitingHint")} />
      </div>

      {awaitingDelivery > 0 && (
        <Notice tone="warning" icon={MailWarning} title={t("promo.gc.deliveryTitle", { count: awaitingDelivery })}>
          {t("promo.gc.deliveryBody")}
        </Notice>
      )}

      {/* The product itself: what customers buy, one click from its settings and from its page. */}
      <section className="gt-admin-panel grid gap-4 p-4 sm:grid-cols-[180px_minmax(0,1fr)_auto] sm:items-center">
        <div className="w-[180px] max-w-full">
          <GiftCardVisual design={settings?.defaultDesign ?? "sparkle"} amountCents={settings?.amounts[0] ?? null} size="sm" label="" />
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-1">
          <h2 className="text-[length:var(--text-body-md)]">{t("promo.cards.productTitle")}</h2>
          {settings ? (
            <>
              <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">
                {t("promo.cards.productSummary", {
                  amounts: settings.amounts.map((a) => money(a)).join(" · "),
                  expiry: settings.expiryMonths ? t("promo.config.months", { count: settings.expiryMonths }) : t("promo.config.noExpiry"),
                })}
              </p>
              <p className="m-0 text-[length:var(--text-caption)] font-semibold">
                {settings.published ? (
                  <span className="text-[var(--status-success-fg)]">● {t("promo.config.published")}</span>
                ) : (
                  <span className="text-[var(--status-warning-fg)]">○ {t("promo.config.unpublished")}</span>
                )}
              </p>
            </>
          ) : (
            <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{loading ? t("promo.common.loading") : "—"}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <AdminButton variant="dark" iconLeft={Settings2} onClick={() => navigate("/admin/promotions/cartes-cadeaux/configuration")}>
            {t("promo.cards.configure")}
          </AdminButton>
          <AdminButton variant="outline" iconLeft={ExternalLink} onClick={() => navigate("/carte-cadeau")}>
            {t("promo.cards.viewStore")}
          </AdminButton>
          {canManage && (
            <AdminButton variant="primary" iconLeft={Plus} onClick={() => setIssuing(true)}>
              {t("promo.gc.issue")}
            </AdminButton>
          )}
        </div>
      </section>

      {!loading && cards.length === 0 ? (
        <div className="gt-admin-panel">
          <PromoEmpty icon={CircleDollarSign} tone="highlight" title={t("promo.empty.noCards.title")} body={t("promo.gc.emptyBody")} />
        </div>
      ) : (
        <>
          <div className="gt-admin-panel grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_200px_200px_200px] md:items-end">
            <SearchInput
              id="card-search"
              value={filters.query}
              onChange={(query) => set({ query })}
              label={t("promo.gc.search")}
              placeholder={t("promo.gc.search")}
              clearLabel={t("promo.filters.clearSearch")}
            />
            <label className="grid grid-cols-[minmax(0,1fr)] gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)]">{t("promo.cards.status")}</span>
              <AdminSelect
                value={filters.status}
                onChange={(e) => set({ status: e.target.value as GiftCardFilters["status"] })}
                options={[
                  { value: "all", label: t("promo.cards.allStatuses") },
                  ...GIFT_CARD_STATUSES.map((s) => ({
                    value: s,
                    label: `${t(`promo.cardStatus.${s}`)} (${cards.filter((c) => c.status === s).length})`,
                  })),
                ]}
              />
            </label>
            <label className="grid grid-cols-[minmax(0,1fr)] gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)]">{t("promo.cards.delivery")}</span>
              <AdminSelect
                value={filters.delivery}
                onChange={(e) => set({ delivery: e.target.value as GiftCardFilters["delivery"] })}
                options={[{ value: "all", label: t("promo.cards.allDeliveries") }, ...DELIVERY_STATUSES.map((s) => ({ value: s, label: t(`promo.delivery.${s}`) }))]}
              />
            </label>
            <label className="grid grid-cols-[minmax(0,1fr)] gap-1">
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
              <GiftCardsTable cards={paged.items} />
              <GiftCardList cards={paged.items} />
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

      {issuing && <IssueDialog onClose={() => setIssuing(false)} onIssued={(id) => navigate(giftCardAdminPath({ id }))} />}
    </div>
  );
}

/**
 * A goodwill / manual card. The database checks the permission, the amount
 * (two decimals, at most 10 000) and the address again; the card is usable at
 * once and still has to reach its recipient (delivery e-mail not built).
 */
function IssueDialog({ onClose, onIssued }: { onClose: () => void; onIssued: (id: string) => void }) {
  const { t } = useTranslation();
  const money = useMoney();
  const { showToast } = useToast();
  const store = useAdminGiftCards();
  const [amount, setAmount] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [expiry, setExpiry] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const minor = parseAmountInput(amount);
  const amountError = amount && (minor === null || minor <= 0 || minor > 1_000_000) ? t("promo.gc.amountInvalid") : undefined;
  const emailError = email && !EMAIL_RE.test(email.trim()) ? t("promo.validation.email") : undefined;
  const valid = minor !== null && minor > 0 && minor <= 1_000_000 && EMAIL_RE.test(email.trim()) && note.trim().length >= 3;

  const submit = async () => {
    if (!valid || minor === null) return;
    setBusy(true);
    setError(null);
    const result = await store.issue({
      amountMinor: minor,
      recipientEmail: email,
      recipientName: name,
      message,
      expiresAt: expiry ? endOfDayIso(expiry) : null,
      note,
    });
    setBusy(false);
    if (!result.ok) {
      setError(t(`promo.gc.errors.${result.error}`));
      return;
    }
    showToast(t("promo.gc.issuedToast", { amount: money(minor) }), t("promo.gc.issuedToastBody"));
    onClose();
    onIssued(result.value);
  };

  return (
    <FormDialog
      open
      icon={Gift}
      title={t("promo.gc.issueTitle")}
      description={t("promo.gc.issueBody")}
      confirmLabel={minor ? t("promo.gc.issueConfirm", { amount: money(minor) }) : t("promo.gc.issue")}
      cancelLabel={t("promo.common.cancel")}
      onClose={onClose}
      onConfirm={() => void submit()}
      confirmDisabled={!valid}
      loading={busy}
    >
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
        <FormField label={t("promo.giftDetail.amount")} error={amountError || undefined} required>
          {(a) => <UnitInput id={a.id} describedBy={a["aria-describedby"]} invalid={a["aria-invalid"]} unit="€" value={amount} onChange={setAmount} />}
        </FormField>
        <FormField label={t("promo.giftDetail.recipientEmail")} error={emailError} required>
          {(a) => <input {...a} type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="gt-admin-field" autoComplete="off" />}
        </FormField>
        <FormField label={t("promo.gc.recipientName")}>
          {(a) => <input {...a} type="text" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} className="gt-admin-field" autoComplete="off" />}
        </FormField>
        <FormField label={t("promo.gc.message")}>
          {(a) => <textarea {...a} rows={2} maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)} className="gt-admin-field" />}
        </FormField>
        <FormField label={t("promo.gc.expiry")} hint={t("promo.gc.expiryHint")}>
          {(a) => <input {...a} type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} className="gt-admin-field" />}
        </FormField>
        <FormField label={t("promo.giftDetail.reason")} hint={t("promo.gc.noteHint")} required>
          {(a) => <textarea {...a} rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} className="gt-admin-field" placeholder={t("promo.gc.notePlaceholder")} />}
        </FormField>
        {error && (
          <p role="alert" className="m-0 rounded-[var(--admin-radius-sm)] bg-[var(--status-error-bg)] px-3 py-2 text-[length:var(--text-caption)] font-medium text-[var(--status-error-fg)]">
            {error}
          </p>
        )}
      </div>
    </FormDialog>
  );
}
