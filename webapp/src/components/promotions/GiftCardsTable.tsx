import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "../../lib/navigation";
import clsx from "clsx";
import { giftCardAdminPath, maskedCode, type AdminGiftCard } from "../../lib/giftCards/giftCardMapping";
import { DeliveryLabel, GiftCardStatusBadge, useMoney, usePromoDates } from "./PromoBadges";
import { GiftCardVisual } from "./Visuals";

/**
 * Gift cards: table from `lg`, cards below. The balance is shown as an amount
 * *and* a bar against the original value, because "€45 left of €100" is what
 * support is asked about most. A card is named by the last 4 characters of
 * its code: the code itself never reaches the back office.
 */

const head =
  "border-b border-[var(--border-subtle)] bg-[var(--admin-panel-sunken)] px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)] whitespace-nowrap";

function Balance({ card }: { card: AdminGiftCard }) {
  const money = useMoney();
  const ratio = card.initialMinor ? card.balanceMinor / card.initialMinor : 0;
  return (
    <div className="grid min-w-[96px] gap-1">
      <span className="text-[length:var(--text-body-sm)] font-semibold tabular-nums text-[var(--text-primary)]">{money(card.balanceMinor)}</span>
      <span aria-hidden="true" className="block h-1.5 w-full overflow-hidden rounded-full bg-[var(--gt-ink-100)]">
        <span className="block h-full rounded-full bg-[var(--gt-emerald-500)]" style={{ width: `${Math.min(100, ratio * 100)}%` }} />
      </span>
    </div>
  );
}

function Who({ card }: { card: AdminGiftCard }) {
  const { t } = useTranslation();
  return (
    <span className="grid leading-tight">
      <span className="whitespace-nowrap">{card.source === "manual" ? t("promo.gc.manual") : (card.purchaserEmail ?? "—")}</span>
      {card.orderNumber && <span className="text-[11px] text-[var(--text-muted)]">{card.orderNumber}</span>}
    </span>
  );
}

const codeLink =
  "whitespace-nowrap rounded-[2px] font-[family-name:var(--gt-font-mono)] text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]";

export function GiftCardsTable({ cards }: { cards: AdminGiftCard[] }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const money = useMoney();
  const { date } = usePromoDates();

  return (
    <div className="gt-admin-panel hidden overflow-hidden lg:block">
      <div className="gt-admin-scroll overflow-x-auto">
        <table className="w-full min-w-[1040px] border-separate border-spacing-0 text-[length:var(--text-body-sm)]">
          <caption className="sr-only">{t("promo.cards.caption")}</caption>
          <thead>
            <tr>
              <th scope="col" className={clsx(head, "pl-4")}>{t("promo.cards.code")}</th>
              <th scope="col" className={head}>{t("promo.cards.recipient")}</th>
              <th scope="col" className={head}>{t("promo.gc.origin")}</th>
              <th scope="col" className={clsx(head, "text-right")}>{t("promo.cards.initial")}</th>
              <th scope="col" className={head}>{t("promo.cards.balance")}</th>
              <th scope="col" className={head}>{t("promo.gc.created")}</th>
              <th scope="col" className={head}>{t("promo.cards.expires")}</th>
              <th scope="col" className={head}>{t("promo.cards.status")}</th>
              <th scope="col" className={head}>{t("promo.cards.delivery")}</th>
            </tr>
          </thead>
          <tbody>
            {cards.map((card) => {
              const dim = card.status === "cancelled" || card.status === "expired" || card.status === "redeemed" || card.status === "void";
              const cell = "border-b border-[var(--border-subtle)] px-3 py-3 align-middle";
              return (
                <tr
                  key={card.id}
                  className={clsx("gt-admin-row cursor-pointer", dim && "text-[var(--text-muted)]")}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest("a,button,input")) return;
                    navigate(giftCardAdminPath(card));
                  }}
                >
                  <td className={clsx(cell, "pl-4")}>
                    <span className="flex items-center gap-3">
                      <span className="hidden w-12 flex-none 2xl:block">
                        <GiftCardVisual design={card.design} amountCents={card.initialMinor} size="sm" label="" />
                      </span>
                      <Link to={giftCardAdminPath(card)} className={codeLink} aria-label={t("promo.gc.openCard", { last4: card.last4 })}>
                        {maskedCode(card.last4)}
                      </Link>
                    </span>
                  </td>
                  <td className={cell}>
                    <span className="grid leading-tight">
                      <span className="font-semibold text-[var(--text-primary)]">{card.recipientName ?? "—"}</span>
                      <span className="text-[11px] text-[var(--text-muted)]">{card.recipientEmail}</span>
                    </span>
                  </td>
                  <td className={cell}>
                    <Who card={card} />
                  </td>
                  <td className={clsx(cell, "text-right tabular-nums")}>{money(card.initialMinor)}</td>
                  <td className={cell}>
                    <Balance card={card} />
                  </td>
                  <td className={clsx(cell, "whitespace-nowrap text-[length:var(--text-caption)]")}>{date(card.createdAt)}</td>
                  <td className={clsx(cell, "whitespace-nowrap text-[length:var(--text-caption)]")}>
                    {card.expiresAt ? date(card.expiresAt) : t("promo.config.noExpiry")}
                  </td>
                  <td className={cell}>
                    <GiftCardStatusBadge status={card.status} />
                  </td>
                  <td className={clsx(cell, "whitespace-nowrap")}>
                    <DeliveryLabel status={card.delivery} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function GiftCardList({ cards }: { cards: AdminGiftCard[] }) {
  const { t } = useTranslation();
  const money = useMoney();
  const { date } = usePromoDates();
  return (
    <ul className="m-0 grid list-none gap-2.5 p-0 lg:hidden">
      {cards.map((card) => (
        <li key={card.id} className="gt-admin-panel grid gap-3 p-4">
          <div className="flex items-start gap-3">
            <span className="w-16 flex-none">
              <GiftCardVisual design={card.design} amountCents={card.initialMinor} size="sm" label="" />
            </span>
            <div className="grid min-w-0 flex-1 gap-1">
              <Link to={giftCardAdminPath(card)} className={clsx(codeLink, "w-fit")} aria-label={t("promo.gc.openCard", { last4: card.last4 })}>
                {maskedCode(card.last4)}
              </Link>
              <span className="truncate text-[length:var(--text-body-sm)] font-semibold">{card.recipientName ?? card.recipientEmail}</span>
              <span className="truncate text-[11px] text-[var(--text-muted)]">
                {card.source === "manual" ? t("promo.gc.manual") : (card.purchaserEmail ?? "")}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <GiftCardStatusBadge status={card.status} />
            <DeliveryLabel status={card.delivery} />
          </div>
          <div className="grid grid-cols-2 items-end gap-3">
            <div>
              <span className="text-[11px] text-[var(--text-muted)]">{t("promo.cards.balanceOf", { initial: money(card.initialMinor) })}</span>
              <Balance card={card} />
            </div>
            <p className="m-0 text-right text-[11px] text-[var(--text-muted)]">
              {card.expiresAt ? t("promo.cards.expiresOn", { date: date(card.expiresAt) }) : t("promo.config.noExpiry")}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
