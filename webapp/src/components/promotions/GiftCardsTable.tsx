import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { Copy, Eye, Send } from "lucide-react";
import clsx from "clsx";
import { OverflowMenu } from "../admin/OverflowMenu";
import {
  giftCardBalance,
  giftCardInitial,
  giftCardStatus,
  type GiftCard,
} from "../../data/adminPromotions";
import { DeliveryLabel, GiftCardStatusBadge, useMoney, usePromoDates } from "./PromoBadges";
import { GiftCardVisual } from "./Visuals";

/**
 * Gift cards: table from `lg`, cards below. The balance is shown as an amount
 * *and* a bar against the original value, because "€45 left of €100" is what
 * support is asked about most, and the bar lets the eye compare rows.
 */

const head =
  "border-b border-[var(--border-subtle)] bg-[var(--admin-panel-sunken)] px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)] whitespace-nowrap";

interface Props {
  cards: GiftCard[];
  onCopy: (card: GiftCard) => void;
  onResend: (card: GiftCard) => void;
}

function Balance({ card }: { card: GiftCard }) {
  const money = useMoney();
  const balance = Math.max(0, giftCardBalance(card));
  const initial = giftCardInitial(card);
  const ratio = initial ? balance / initial : 0;
  return (
    <div className="grid min-w-[96px] gap-1">
      <span className="text-[length:var(--text-body-sm)] font-semibold tabular-nums text-[var(--text-primary)]">{money(balance)}</span>
      <span aria-hidden="true" className="block h-1.5 w-full overflow-hidden rounded-full bg-[var(--gt-ink-100)]">
        <span className="block h-full rounded-full bg-[var(--gt-emerald-500)]" style={{ width: `${Math.min(100, ratio * 100)}%` }} />
      </span>
    </div>
  );
}

function useActions({ onCopy, onResend }: Pick<Props, "onCopy" | "onResend">) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (card: GiftCard) => {
    const status = giftCardStatus(card);
    return [
      { id: "view", label: t("promo.actions.view"), icon: Eye, onSelect: () => navigate(`/admin/promotions/cartes-cadeaux/${card.code}`) },
      { id: "copy", label: t("promo.cards.copyCode"), icon: Copy, onSelect: () => onCopy(card) },
      {
        id: "resend",
        label: t("promo.cards.resend"),
        icon: Send,
        onSelect: () => onResend(card),
        disabled: status === "cancelled" || status === "scheduled",
      },
    ];
  };
}

export function GiftCardsTable(props: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const money = useMoney();
  const { date } = usePromoDates();
  const actions = useActions(props);

  return (
    <div className="gt-admin-panel hidden overflow-hidden lg:block">
      <div className="gt-admin-scroll overflow-x-auto">
        <table className="w-full min-w-[1120px] border-separate border-spacing-0 text-[length:var(--text-body-sm)]">
          <caption className="sr-only">{t("promo.cards.caption")}</caption>
          <thead>
            <tr>
              <th scope="col" className={clsx(head, "pl-4")}>{t("promo.cards.code")}</th>
              <th scope="col" className={head}>{t("promo.cards.recipient")}</th>
              <th scope="col" className={head}>{t("promo.cards.purchaser")}</th>
              <th scope="col" className={clsx(head, "text-right")}>{t("promo.cards.initial")}</th>
              <th scope="col" className={head}>{t("promo.cards.balance")}</th>
              <th scope="col" className={head}>{t("promo.cards.purchased")}</th>
              <th scope="col" className={head}>{t("promo.cards.expires")}</th>
              <th scope="col" className={head}>{t("promo.cards.status")}</th>
              <th scope="col" className={head}>{t("promo.cards.delivery")}</th>
              <th scope="col" className={head}>
                <span className="sr-only">{t("promo.table.actions")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {props.cards.map((card) => {
              const status = giftCardStatus(card);
              const dim = status === "cancelled" || status === "expired" || status === "redeemed";
              const cell = "border-b border-[var(--border-subtle)] px-3 py-3 align-middle";
              return (
                <tr
                  key={card.code}
                  className={clsx("gt-admin-row cursor-pointer", dim && "text-[var(--text-muted)]")}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest("a,button,input")) return;
                    navigate(`/admin/promotions/cartes-cadeaux/${card.code}`);
                  }}
                >
                  <td className={clsx(cell, "pl-4")}>
                    <span className="flex items-center gap-3">
                      <span className="hidden w-12 flex-none 2xl:block">
                        <GiftCardVisual design={card.design} amountCents={giftCardInitial(card)} size="sm" label="" />
                      </span>
                      <Link
                        to={`/admin/promotions/cartes-cadeaux/${card.code}`}
                        className="whitespace-nowrap rounded-[2px] font-[family-name:var(--gt-font-mono)] text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
                      >
                        {card.code}
                      </Link>
                    </span>
                  </td>
                  <td className={cell}>
                    <span className="grid leading-tight">
                      <span className="font-semibold text-[var(--text-primary)]">{card.recipientName}</span>
                      <span className="text-[11px] text-[var(--text-muted)]">{card.recipientEmail}</span>
                    </span>
                  </td>
                  <td className={cell}>
                    <span className="grid leading-tight">
                      <span className="whitespace-nowrap">{card.purchaserName}</span>
                      <span className="text-[11px] text-[var(--text-muted)]">{card.orderRef}</span>
                    </span>
                  </td>
                  <td className={clsx(cell, "text-right tabular-nums")}>{money(giftCardInitial(card))}</td>
                  <td className={cell}>
                    <Balance card={card} />
                  </td>
                  <td className={clsx(cell, "whitespace-nowrap text-[length:var(--text-caption)]")}>{date(card.purchasedAt)}</td>
                  <td className={clsx(cell, "whitespace-nowrap text-[length:var(--text-caption)]")}>{date(card.expiresAt)}</td>
                  <td className={cell}>
                    <GiftCardStatusBadge status={status} />
                  </td>
                  <td className={clsx(cell, "whitespace-nowrap")}>
                    <DeliveryLabel status={card.delivery} />
                  </td>
                  <td className={clsx(cell, "text-right")}>
                    <OverflowMenu label={t("promo.actions.more", { name: card.code })} actions={actions(card)} />
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

export function GiftCardList(props: Props) {
  const { t } = useTranslation();
  const money = useMoney();
  const { date } = usePromoDates();
  const actions = useActions(props);
  return (
    <ul className="m-0 grid list-none gap-2.5 p-0 lg:hidden">
      {props.cards.map((card) => {
        const status = giftCardStatus(card);
        return (
          <li key={card.code} className="gt-admin-panel grid gap-3 p-4">
            <div className="flex items-start gap-3">
              <span className="w-16 flex-none">
                <GiftCardVisual design={card.design} amountCents={giftCardInitial(card)} size="sm" label="" />
              </span>
              <div className="grid min-w-0 flex-1 gap-1">
                <Link
                  to={`/admin/promotions/cartes-cadeaux/${card.code}`}
                  className="w-fit rounded-[2px] font-[family-name:var(--gt-font-mono)] text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
                >
                  {card.code}
                </Link>
                <span className="truncate text-[length:var(--text-body-sm)] font-semibold">{card.recipientName}</span>
                <span className="truncate text-[11px] text-[var(--text-muted)]">
                  {t("promo.cards.fromName", { name: card.purchaserName })}
                </span>
              </div>
              <OverflowMenu label={t("promo.actions.more", { name: card.code })} actions={actions(card)} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <GiftCardStatusBadge status={status} />
              <DeliveryLabel status={card.delivery} />
            </div>
            <div className="grid grid-cols-2 items-end gap-3">
              <div>
                <span className="text-[11px] text-[var(--text-muted)]">
                  {t("promo.cards.balanceOf", { initial: money(giftCardInitial(card)) })}
                </span>
                <Balance card={card} />
              </div>
              <p className="m-0 text-right text-[11px] text-[var(--text-muted)]">
                {t("promo.cards.expiresOn", { date: date(card.expiresAt) })}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
