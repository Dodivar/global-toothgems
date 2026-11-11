import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Info } from "lucide-react";
import { useFormat } from "../../lib/format";
import { fetchAdminPriceReferences, type AdminPriceReference } from "../../lib/adminPriceReference";
import type { CustomVariant } from "../../data/adminCatalog";

/**
 * Read-only: the product's reference price and whether the shop strikes out a price now, with the reason when it
 * does not (decision 129, Omnibus). The figures come from the database's price history; no field here can set a
 * struck-out price — promotions are the only way to lower a price, and the database decides what is struck.
 */
export function PriceReferencePanel({ productId, variants = [] }: { productId: string; variants?: CustomVariant[] }) {
  const { t, i18n } = useTranslation();
  const { formatPrice, formatDate } = useFormat();
  const [state, setState] = useState<{ status: "loading" | "ready" | "error"; rows: AdminPriceReference[] }>({ status: "loading", rows: [] });

  useEffect(() => {
    let current = true;
    fetchAdminPriceReferences(productId)
      .then((rows) => current && setState({ status: "ready", rows }))
      .catch((error: unknown) => {
        console.error("[price reference] read failed", error instanceof Error ? error.message : error);
        if (current) setState({ status: "error", rows: [] });
      });
    return () => {
      current = false;
    };
  }, [productId]);

  const money = (cents: number, currency: string) => formatPrice(cents / 100, undefined, currency);
  const lang = i18n.language === "en" ? "en" : "fr";

  const explain = (row: AdminPriceReference): string => {
    const reference = row.referenceCents !== null ? money(row.referenceCents, row.currency) : "";
    const date = row.startedAt ? formatDate(row.startedAt) : "";
    switch (row.state) {
      case "reduced":
        return t("admin.form.reference.reduced", { reference, percent: row.percent ?? 0, date });
      case "not_lower":
        return t("admin.form.reference.notLower", { reference, date });
      case "no_history":
        return t("admin.form.reference.noHistory", { date });
      default:
        return row.referenceCents !== null ? t("admin.form.reference.noReduction", { reference }) : t("admin.form.reference.noReductionNoHistory");
    }
  };

  const product = state.rows.find((row) => row.variantId === null);
  const options = state.rows.filter((row) => row.variantId !== null && row.state !== "no_reduction");

  return (
    <div className="grid gap-2 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-3.5" data-testid="price-reference-panel">
      <p className="m-0 flex items-center gap-1.5 text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">
        <Info size={14} aria-hidden="true" className="flex-none" />
        {t("admin.form.reference.title")}
      </p>
      <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("admin.form.reference.intro")}</p>
      {state.status === "loading" && <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]" role="status">{t("admin.form.reference.loading")}</p>}
      {state.status === "error" && <p className="m-0 text-[length:var(--text-caption)] text-[var(--status-error-fg)]" role="alert">{t("admin.form.reference.error")}</p>}
      {state.status === "ready" && !product && <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("admin.form.reference.noReductionNoHistory")}</p>}
      {product && (
        <>
          <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[length:var(--text-body-sm)]">
            <dt className="text-[var(--text-muted)]">{t("admin.form.reference.priceNow")}</dt>
            <dd className="m-0 font-semibold tabular-nums text-[var(--text-primary)]">{money(product.priceCents, product.currency)}</dd>
            <dt className="text-[var(--text-muted)]">{t("admin.form.reference.reference")}</dt>
            <dd className="m-0 font-semibold tabular-nums text-[var(--text-primary)]">
              {product.referenceCents !== null ? money(product.referenceCents, product.currency) : t("admin.form.reference.none")}
            </dd>
          </dl>
          <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-body)]">{explain(product)}</p>
        </>
      )}
      {options.length > 0 && (
        <ul className="m-0 grid list-none gap-1 p-0 text-[length:var(--text-caption)] text-[var(--text-body)]">
          {options.map((row) => {
            const name = variants.find((v) => v.id === row.variantId)?.name[lang] || t("admin.form.reference.option");
            return (
              <li key={row.variantId}>
                <span className="font-semibold text-[var(--text-primary)]">{name}</span> — {explain(row)}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
