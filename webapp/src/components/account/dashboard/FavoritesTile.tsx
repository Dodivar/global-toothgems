import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Heart } from "lucide-react";
import { DashboardTile } from "./DashboardTile";
import { pick } from "../../../data/types";
import { useFavorites } from "../../../lib/favorites";
import { summarizeFavorites } from "../../../lib/memberDashboard";
import { useStorefrontOffers } from "../../../lib/useStorefrontOffers";

/**
 * The favourites, as a reason to go back to them: their pictures, and what
 * changed that matters — some on sale, some nearly gone. Opens the shop's
 * favourites view. Hidden while the list is empty or not read yet.
 */
export function FavoritesTile() {
  const { t, i18n } = useTranslation();
  const titleId = useId();
  const { status, favoriteProducts } = useFavorites();
  const { offerFor } = useStorefrontOffers();
  if (status !== "ready" || favoriteProducts.length === 0) return null;
  const summary = summarizeFavorites(
    favoriteProducts,
    (p) => offerFor({ dbId: p.dbId, cat: p.cat, currency: p.currency ?? "EUR" })?.reference?.struckCents != null,
  );
  const shown = favoriteProducts.slice(0, 4);
  const more = favoriteProducts.length - shown.length;

  const news = [
    summary.onSale > 0 ? t("account.dashboard.favoritesOnSale", { count: summary.onSale }) : null,
    summary.lowStock > 0 ? t("account.dashboard.favoritesLowStock", { count: summary.lowStock }) : null,
  ].filter((line): line is string => line !== null);

  return (
    <DashboardTile icon={Heart} eyebrow={t("account.dashboard.favoritesEyebrow")} to="/boutique?favoris=1" cta={t("account.dashboard.favoritesCta")} labelledBy={titleId}>
      <h3 id={titleId} className="m-0 text-[length:var(--text-h4)] text-[var(--text-primary)]">
        {t("account.dashboard.favoritesTitle", { count: summary.total })}
      </h3>
      <ul className="m-0 flex list-none gap-2 p-0" aria-label={t("account.dashboard.favoritesTitle", { count: summary.total })}>
        {shown.map((product) => (
          <li key={product.id} className="h-12 w-12 flex-none overflow-hidden rounded-[var(--radius-sm)] bg-[var(--surface-sunken)]">
            {product.image && (
              <img src={product.image} alt={pick(product.name, i18n.language)} loading="lazy" decoding="async" className="h-full w-full object-cover" />
            )}
          </li>
        ))}
        {more > 0 && (
          <li className="grid h-12 w-12 flex-none place-items-center rounded-[var(--radius-sm)] bg-[var(--gt-blue-50)] text-[length:var(--text-caption)] font-semibold tabular-nums text-[var(--text-muted)]">
            +{more}
          </li>
        )}
      </ul>
      {news.length > 0 && (
        <p className="m-0 text-[length:var(--text-body-sm)] font-semibold text-[var(--accent-highlight-ink)]">{news.join(" · ")}</p>
      )}
    </DashboardTile>
  );
}
