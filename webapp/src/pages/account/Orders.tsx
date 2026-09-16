import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Package, ShoppingBag } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { OrderCard } from "../../components/account/OrderCard";
import { EmptyPanel, SectionHeader } from "../../components/account/SectionHeader";
import { useOrders } from "../../lib/orders";
import { useToast } from "../../lib/toast";
import { formatPrice } from "../../lib/format";

/**
 * Purchase history and parcel tracking. The list comes from `lib/orders.tsx`,
 * which the cart writes to on payment, so an order placed in this session shows
 * up here at the top — in `processing`, with no tracking number yet.
 */
export function Orders() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const lang = i18n.language;
  const { orders, totalSpent } = useOrders();
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
      {orders.length === 0 ? (
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
            <OrderCard key={order.reference} order={order} lang={lang} onInvoice={invoiceNotShipped} />
          ))}
        </ul>
      )}
    </section>
  );
}
