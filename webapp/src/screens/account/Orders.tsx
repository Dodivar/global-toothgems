import { useTranslation } from "react-i18next";
import { useNavigate } from "../../lib/navigation";
import { Package, RotateCw, ShoppingBag } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { OrderCard } from "../../components/account/OrderCard";
import { OrderLineReviewAction } from "../../components/reviews/OrderLineReviewAction";
import { EmptyPanel, SectionHeader } from "../../components/account/SectionHeader";
import { useOrders } from "../../lib/orders";
import { useToast } from "../../lib/toast";
import { useFormat } from "../../lib/format";

/**
 * Purchase history and parcel tracking. The list comes from `lib/orders.tsx`:
 * the account's paid orders in Supabase, or the prototype's in-memory history.
 */
export function Orders() {
  const { formatPrice } = useFormat();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const lang = i18n.language;
  const { orders, status, reload, totalSpent } = useOrders();
  const { showToast } = useToast();

  const invoiceNotShipped = () => showToast(t("common.notIncludedTitle"), t("common.notIncludedScreen"), "info");

  return (
    <section className="grid gap-5">
      <SectionHeader
        icon={Package}
        eyebrow={t("account.ordersEyebrow")}
        title={t("account.ordersTitle")}
        description={t("account.ordersBody")}
        actions={
          orders.length > 0 && (
            <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
              {t("account.ordersTotalSpent")}{" "}
              <strong className="tabular-nums text-[var(--text-primary)]">{formatPrice(totalSpent)}</strong>
            </span>
          )
        }
      />
      {status === "loading" ? (
        <p role="status" aria-busy="true" className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
          {t("account.ordersLoading")}
        </p>
      ) : status === "error" ? (
        <EmptyPanel
          action={
            <Button variant="outline" size="sm" iconLeft={RotateCw} onClick={reload}>
              {t("account.ordersRetry")}
            </Button>
          }
        >
          {t("account.ordersLoadError")}
        </EmptyPanel>
      ) : orders.length === 0 ? (
        <EmptyPanel
          action={
            <Button variant="outline" size="sm" iconLeft={ShoppingBag} onClick={() => navigate("/boutique")}>
              {t("account.ordersEmptyCta")}
            </Button>
          }
        >
          {t("account.ordersEmpty")}
        </EmptyPanel>
      ) : (
        <ul className="m-0 grid list-none gap-4 p-0">
          {orders.map((order) => (
            <OrderCard
              key={order.reference}
              order={order}
              lang={lang}
              onInvoice={invoiceNotShipped}
              lineAction={(line) => <OrderLineReviewAction line={line} />}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
