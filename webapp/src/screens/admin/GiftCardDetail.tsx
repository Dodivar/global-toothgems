"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "../../lib/navigation";
import {
  Ban,
  CalendarPlus,
  CircleCheck,
  CircleMinus,
  CirclePlus,
  Gift,
  History,
  Hourglass,
  MailWarning,
  RotateCcw,
  SearchX,
  Send,
  ShoppingBag,
  SlidersHorizontal,
  Undo2,
  Wallet,
} from "lucide-react";
import clsx from "clsx";
import { AdminButton } from "../../components/admin/AdminButton";
import { AdminHeader } from "../../components/admin/AdminHeader";
import { FormField } from "../../components/admin/FormField";
import { OverflowMenu } from "../../components/admin/OverflowMenu";
import { useToast } from "../../lib/toast";
import { isSupabaseConfigured } from "../../lib/supabase/client";
import { useAdminGiftCards } from "../../lib/giftCards/AdminGiftCardsProvider";
import { fetchGiftCardDetail, type GiftCardDetail as Detail } from "../../lib/giftCards/api";
import {
  cardActions,
  endOfDayIso,
  maskedCode,
  parseAmountInput,
  type AdminGiftCard,
  type GiftCardTransaction,
  type GiftCardWriteError,
  type LedgerKind,
} from "../../lib/giftCards/giftCardMapping";
import { DeliveryLabel, GiftCardStatusBadge, useMoney, usePromoDates } from "../../components/promotions/PromoBadges";
import { Fact, FormDialog, Notice, Panel, Segmented, UnitInput } from "../../components/promotions/PromoUi";
import { GiftCardVisual } from "../../components/promotions/Visuals";
import { PromoEmpty } from "../../components/promotions/PromoEmpty";
import { useAdminShell } from "./AdminLayout";

/**
 * One gift card: the card, what is left on it, and every movement.
 *
 * Everything comes from the database: the balance and status from
 * `gift_card_overview`, the history from the append-only ledger (with the
 * balance after each line as the database recorded it). Adjust, extend and
 * cancel are the staff functions; they need `manage_promotions`, which the
 * database checks — the buttons are only offered to members who hold it.
 * The code is never shown (last 4 characters only).
 */
type State = { status: "loading" } | { status: "ready"; detail: Detail } | { status: "missing" } | { status: "error" };

export function GiftCardDetail() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id = "" } = useParams();
  const { openNav } = useAdminShell();
  const { showToast } = useToast();
  const store = useAdminGiftCards();
  const money = useMoney();
  const { date, dateTime } = usePromoDates();
  const [state, setState] = useState<State>({ status: isSupabaseConfigured ? "loading" : "missing" });
  const [dialog, setDialog] = useState<null | "adjust" | "extend" | "cancel">(null);
  const [busy, setBusy] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    try {
      const detail = await fetchGiftCardDetail(id);
      setState(detail ? { status: "ready", detail } : { status: "missing" });
    } catch (error) {
      console.error("[gift card] detail read failed", error instanceof Error ? error.message : error);
      setState({ status: "error" });
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const backCrumbs = [
    { label: t("admin.nav.promotions"), to: "/admin/promotions" },
    { label: t("promo.tabs.giftCards"), to: "/admin/promotions?vue=cartes-cadeaux" },
  ];

  if (state.status !== "ready") {
    return (
      <>
        <AdminHeader
          title={state.status === "loading" ? t("promo.common.loading") : state.status === "error" ? t("promo.error.title") : t("promo.notFound.card")}
          onOpenNav={openNav}
          crumbs={backCrumbs}
        />
        <div className="px-[var(--admin-gutter)] pt-5">
          {state.status === "loading" ? (
            <div className="gt-admin-panel grid gap-3 p-5" role="status" aria-label={t("promo.common.loading")}>
              <div className="gt-skeleton h-40 rounded-[var(--admin-radius-sm)]" />
              <div className="gt-skeleton h-10 rounded-[var(--admin-radius-sm)]" />
            </div>
          ) : (
            <div className="gt-admin-panel">
              <PromoEmpty
                icon={SearchX}
                tone="neutral"
                title={state.status === "error" ? t("promo.error.title") : t("promo.notFound.card")}
                body={state.status === "error" ? t("promo.gc.loadError") : t("promo.gc.notFoundBody")}
                actions={
                  state.status === "error" ? (
                    <AdminButton variant="dark" iconLeft={RotateCcw} onClick={() => void load()}>{t("promo.error.retry")}</AdminButton>
                  ) : (
                    <AdminButton variant="dark" onClick={() => navigate("/admin/promotions?vue=cartes-cadeaux")}>{t("promo.common.backToCards")}</AdminButton>
                  )
                }
              />
            </div>
          )}
        </div>
      </>
    );
  }

  const { card, message, ledger } = state.detail;
  const allowed = cardActions(card);
  const manage = store.canManage;
  const title = maskedCode(card.last4);

  const run = async (fn: () => Promise<{ ok: true } | { ok: false; error: GiftCardWriteError }>, toast: string, body?: string, tone: "success" | "warning" = "success") => {
    setBusy(true);
    setWriteError(null);
    const result = await fn();
    await load();
    setBusy(false);
    if (!result.ok) {
      setWriteError(t(`promo.gc.errors.${result.error}`));
      return;
    }
    setDialog(null);
    showToast(toast, body, tone);
  };
  const open = (which: "adjust" | "extend" | "cancel") => {
    setWriteError(null);
    setDialog(which);
  };

  return (
    <>
      <AdminHeader
        title={title}
        description={t("promo.giftDetail.description", { name: card.recipientName ?? card.recipientEmail })}
        crumbs={[...backCrumbs, { label: title }]}
        onOpenNav={openNav}
        actions={
          manage ? (
            <OverflowMenu
              label={t("promo.actions.more", { name: title })}
              actions={[
                { id: "adjust", label: t("promo.giftDetail.adjust"), icon: SlidersHorizontal, onSelect: () => open("adjust"), disabled: !allowed.adjust },
                { id: "extend", label: t("promo.giftDetail.extend"), icon: CalendarPlus, onSelect: () => open("extend"), disabled: !allowed.extend },
                { id: "cancel", label: t("promo.giftDetail.cancel"), icon: Ban, onSelect: () => open("cancel"), tone: "danger", separated: true, disabled: !allowed.cancel },
              ]}
            />
          ) : undefined
        }
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 px-[var(--admin-gutter)] pb-[clamp(32px,5vw,56px)] pt-5">
        {!manage && <Notice tone="info" title={t("promo.gc.readOnly")} />}

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
            <div className={clsx("mx-auto w-full max-w-[420px]", ["cancelled", "expired", "redeemed", "void"].includes(card.status) && "opacity-70 grayscale-[.5]")}>
              <GiftCardVisual
                design={card.design}
                amountCents={card.initialMinor}
                recipient={card.recipientName ?? undefined}
                sender={card.senderName ?? undefined}
                message={message ?? undefined}
                code={title}
                size="lg"
              />
            </div>
            <section className="gt-admin-panel grid gap-3 p-4 sm:p-5" aria-label={t("promo.giftDetail.balance")}>
              <div className="flex items-start justify-between gap-3">
                <div className="grid grid-cols-[minmax(0,1fr)] gap-0.5">
                  <span className="text-[11px] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)]">{t("promo.giftDetail.currentBalance")}</span>
                  <span className="text-[36px] font-bold leading-none tabular-nums text-[var(--text-primary)]">{money(card.balanceMinor)}</span>
                  <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("promo.giftDetail.ofOriginal", { amount: money(card.initialMinor) })}</span>
                </div>
                <GiftCardStatusBadge status={card.status} size="md" />
              </div>
              <span aria-hidden="true" className="block h-2 overflow-hidden rounded-full bg-[var(--gt-ink-100)]">
                <span
                  className="block h-full rounded-full bg-[linear-gradient(90deg,var(--gt-emerald-400),var(--gt-emerald-500))]"
                  style={{ width: `${card.initialMinor ? Math.min(100, (card.balanceMinor / card.initialMinor) * 100) : 0}%` }}
                />
              </span>
            </section>
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
            <StateNotice card={card} manage={manage} onExtend={() => open("extend")} />

            <Panel title={t("promo.giftDetail.details")} icon={Gift}>
              <dl className="m-0 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <Fact label={t("promo.cards.code")} mono value={title} />
                <Fact label={t("promo.giftDetail.currentBalance")} value={money(card.balanceMinor)} />
                <Fact label={t("promo.cards.initial")} value={money(card.initialMinor)} />
                <Fact label={t("promo.gc.origin")} value={card.source === "manual" ? t("promo.gc.manual") : (card.purchaserEmail ?? "—")} />
                <Fact label={t("promo.cards.recipient")} value={<span className="grid">{card.recipientName ?? "—"}<span className="text-[11px] text-[var(--text-muted)]">{card.recipientEmail}</span></span>} />
                <Fact label={t("promo.cards.delivery")} value={<DeliveryLabel status={card.delivery} />} />
                <Fact label={t("promo.gc.created")} value={dateTime(card.createdAt)} />
                <Fact label={t("promo.giftDetail.deliveryDate")} value={card.deliverAt ? dateTime(card.deliverAt) : t("promo.gc.onPayment")} />
                <Fact label={t("promo.cards.expires")} value={card.expiresAt ? date(card.expiresAt) : t("promo.config.noExpiry")} />
                <Fact label={t("promo.cards.status")} value={<GiftCardStatusBadge status={card.status} />} />
                {card.orderId && (
                  <Fact
                    label={t("promo.giftDetail.order")}
                    value={
                      card.orderNumber ? (
                        <Link
                          to={`/admin/commandes/${card.orderNumber}`}
                          className="rounded-[2px] font-[family-name:var(--gt-font-mono)] text-[length:var(--text-caption)] font-semibold underline underline-offset-2 hover:text-[var(--accent-highlight-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
                        >
                          {card.orderNumber}
                        </Link>
                      ) : (
                        "—"
                      )
                    }
                  />
                )}
                <Fact label={t("promo.giftDetail.design")} value={t(`promo.design.${card.design}`)} />
              </dl>
              {message && (
                <blockquote className="m-0 whitespace-pre-line rounded-[var(--admin-radius-sm)] border-l-[3px] border-[var(--gt-fuchsia-300)] bg-[var(--gt-fuchsia-50)] px-4 py-3 text-[length:var(--text-body-sm)] italic text-[var(--text-body)]">
                  “{message}”{card.senderName && <span className="not-italic text-[var(--text-muted)]"> — {card.senderName}</span>}
                </blockquote>
              )}
            </Panel>

            <Ledger ledger={ledger} balanceMinor={card.balanceMinor} />
          </div>
        </div>
      </div>

      {dialog === "adjust" && (
        <AdjustDialog
          balance={card.balanceMinor}
          busy={busy}
          error={writeError}
          onClose={() => setDialog(null)}
          onConfirm={(delta, note) =>
            void run(
              () => store.adjust(card.id, delta, note),
              t("promo.toast.adjusted", { amount: `${delta > 0 ? "+" : "−"}${money(Math.abs(delta))}` }),
              note,
              delta < 0 ? "warning" : "success",
            )
          }
        />
      )}
      {dialog === "extend" && card.expiresAt && (
        <ExtendDialog
          expiresAt={card.expiresAt}
          busy={busy}
          error={writeError}
          onClose={() => setDialog(null)}
          onConfirm={(day, note) => void run(() => store.extend(card.id, endOfDayIso(day), note), t("promo.toast.extended", { date: date(endOfDayIso(day)) }))}
        />
      )}
      {dialog === "cancel" && (
        <CancelDialog
          card={card}
          busy={busy}
          error={writeError}
          onClose={() => setDialog(null)}
          onConfirm={(note) =>
            void run(
              () => store.cancel(card.id, note),
              t("promo.toast.cardCancelled", { code: title }),
              t("promo.toast.cardCancelledBody", { amount: money(card.balanceMinor) }),
              "warning",
            )
          }
        />
      )}
    </>
  );
}

function StateNotice({ card, manage, onExtend }: { card: AdminGiftCard; manage: boolean; onExtend: () => void }) {
  const { t } = useTranslation();
  const money = useMoney();
  const { date, dateTime } = usePromoDates();
  const extend = manage && card.expiresAt ? (
    <AdminButton size="sm" variant="dark" iconLeft={CalendarPlus} onClick={onExtend}>
      {t("promo.giftDetail.extend")}
    </AdminButton>
  ) : undefined;

  switch (card.status) {
    case "cancelled":
      return <Notice tone="error" icon={Ban} title={t("promo.giftDetail.cancelledTitle", { date: card.cancelledAt ? date(card.cancelledAt) : "" })} />;
    case "void":
      return <Notice tone="info" icon={Ban} title={t("promo.gc.voidTitle")}>{t("promo.gc.voidBody")}</Notice>;
    case "pendingPayment":
      return <Notice tone="warning" icon={Hourglass} title={t("promo.gc.pendingTitle")}>{t("promo.gc.pendingBody")}</Notice>;
    case "redeemed":
      return <Notice tone="success" icon={CircleCheck} title={t("promo.giftDetail.redeemedTitle")} />;
    case "expired":
      return (
        <Notice tone="warning" icon={Hourglass} title={t("promo.giftDetail.expiredTitle", { date: card.expiresAt ? date(card.expiresAt) : "", amount: money(card.balanceMinor) })} action={extend}>
          {t("promo.giftDetail.expiredBody")}
        </Notice>
      );
    case "scheduled":
      return (
        <Notice tone="info" icon={Send} title={t("promo.giftDetail.scheduledTitle", { date: card.deliverAt ? dateTime(card.deliverAt) : "" })}>
          {t("promo.gc.scheduledBody", { email: card.recipientEmail })}
        </Notice>
      );
    default:
      if (card.delivery === "bounced")
        return <Notice tone="error" icon={MailWarning} title={t("promo.giftDetail.bouncedTitle", { email: card.recipientEmail })}>{t("promo.giftDetail.bouncedBody")}</Notice>;
      if (card.delivery === "pending")
        return <Notice tone="warning" icon={MailWarning} title={t("promo.gc.notSentTitle")}>{t("promo.gc.notSentBody")}</Notice>;
      return null;
  }
}

const TX_META: Record<LedgerKind, { icon: typeof Gift; tone: string }> = {
  purchase: { icon: Gift, tone: "bg-[var(--gt-fuchsia-50)] text-[var(--accent-highlight-ink)]" },
  issue: { icon: Gift, tone: "bg-[var(--gt-fuchsia-50)] text-[var(--accent-highlight-ink)]" },
  redemption: { icon: ShoppingBag, tone: "bg-[var(--gt-blue-100)] text-[var(--gt-blue-700)]" },
  reversal: { icon: Undo2, tone: "bg-[var(--status-info-bg)] text-[var(--status-info-fg)]" },
  refund: { icon: Wallet, tone: "bg-[var(--status-info-bg)] text-[var(--status-info-fg)]" },
  adjustment: { icon: SlidersHorizontal, tone: "bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)]" },
  extension: { icon: CalendarPlus, tone: "bg-[var(--status-info-bg)] text-[var(--status-info-fg)]" },
  cancellation: { icon: Ban, tone: "bg-[var(--status-error-bg)] text-[var(--status-error-fg)]" },
  resend: { icon: Send, tone: "bg-[var(--surface-sunken)] text-[var(--text-body)]" },
};

/** The ledger, oldest first, with the balance after each line as recorded by the database. */
function Ledger({ ledger, balanceMinor }: { ledger: GiftCardTransaction[]; balanceMinor: number }) {
  const { t } = useTranslation();
  const money = useMoney();
  const { dateTime } = usePromoDates();
  return (
    <Panel title={t("promo.giftDetail.history")} icon={History}>
      <ol className="m-0 grid list-none p-0">
        {ledger.map((tx) => {
          const meta = TX_META[tx.kind];
          const Icon = meta.icon;
          return (
            <li key={tx.id} className="relative grid grid-cols-[32px_minmax(0,1fr)_auto] items-start gap-3 pb-5">
              <span aria-hidden="true" className="absolute left-[15px] top-8 h-[calc(100%-28px)] w-px bg-[var(--border-subtle)]" />
              <span aria-hidden="true" className={clsx("grid h-8 w-8 place-items-center rounded-full", meta.tone)}>
                <Icon size={15} strokeWidth={1.9} />
              </span>
              <div className="grid grid-cols-[minmax(0,1fr)] gap-0.5">
                <span className="text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">
                  {t(`promo.ledger.${tx.kind}`)}
                  {tx.orderNumber && <span className="font-normal text-[var(--text-muted)]"> · {tx.orderNumber}</span>}
                </span>
                <span className="text-[11px] text-[var(--text-muted)]">
                  {tx.actorName || t("promo.gc.system")} · <time dateTime={tx.at}>{dateTime(tx.at)}</time>
                </span>
                {tx.note && <span className="text-[length:var(--text-caption)] text-[var(--text-body)]">{tx.note}</span>}
              </div>
              <div className="grid justify-items-end gap-0.5 text-right">
                {tx.amountMinor !== 0 && (
                  <span className={clsx("text-[length:var(--text-body-sm)] font-bold tabular-nums", tx.amountMinor > 0 ? "text-[var(--status-success-fg)]" : "text-[var(--text-primary)]")}>
                    {tx.amountMinor > 0 ? "+" : "−"}
                    {money(Math.abs(tx.amountMinor))}
                  </span>
                )}
                <span className="text-[11px] tabular-nums text-[var(--text-muted)]">{t("promo.ledger.after", { amount: money(tx.balanceAfterMinor) })}</span>
              </div>
            </li>
          );
        })}
        <li className="grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 rounded-[var(--admin-radius-sm)] bg-[var(--admin-panel-sunken)] p-2">
          <span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-full bg-[var(--gt-ink-900)] text-[var(--gt-white)]">
            <CircleCheck size={15} />
          </span>
          <span className="text-[length:var(--text-body-sm)] font-semibold">{t("promo.ledger.remaining")}</span>
          <span className="text-[length:var(--text-body-md)] font-bold tabular-nums">{money(balanceMinor)}</span>
        </li>
      </ol>
    </Panel>
  );
}

/* -------------------------------------------------------------------------- */
/* Dialogs                                                                    */
/* -------------------------------------------------------------------------- */

function DialogError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="m-0 rounded-[var(--admin-radius-sm)] bg-[var(--status-error-bg)] px-3 py-2 text-[length:var(--text-caption)] font-medium text-[var(--status-error-fg)]">
      {message}
    </p>
  );
}

function AdjustDialog({ balance, busy, error, onClose, onConfirm }: { balance: number; busy: boolean; error: string | null; onClose: () => void; onConfirm: (delta: number, note: string) => void }) {
  const { t } = useTranslation();
  const money = useMoney();
  const [direction, setDirection] = useState<"add" | "remove">("add");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const minor = parseAmountInput(amount);
  const tooMuch = direction === "remove" && minor !== null && minor > balance;
  const tooBig = minor !== null && minor > 1_000_000;
  const invalid = amount !== "" && (minor === null || minor === 0);
  const valid = minor !== null && minor > 0 && !tooMuch && !tooBig && note.trim().length >= 5;
  const after = minor ? balance + (direction === "add" ? minor : -minor) : balance;

  return (
    <FormDialog
      open
      icon={SlidersHorizontal}
      tone={direction === "remove" ? "danger" : "default"}
      title={t("promo.giftDetail.adjustTitle")}
      description={t("promo.giftDetail.adjustBody")}
      confirmLabel={direction === "add" ? t("promo.giftDetail.adjustAdd", { amount: minor ? money(minor) : "" }) : t("promo.giftDetail.adjustRemove", { amount: minor ? money(minor) : "" })}
      cancelLabel={t("promo.common.cancel")}
      onClose={onClose}
      onConfirm={() => minor && onConfirm(direction === "add" ? minor : -minor, note.trim())}
      confirmDisabled={!valid}
      loading={busy}
    >
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
        <Segmented
          label={t("promo.giftDetail.direction")}
          value={direction}
          onChange={setDirection}
          options={[
            { value: "add", label: t("promo.giftDetail.credit"), icon: CirclePlus },
            { value: "remove", label: t("promo.giftDetail.debit"), icon: CircleMinus },
          ]}
        />
        <FormField
          label={t("promo.giftDetail.amount")}
          error={tooMuch ? t("promo.giftDetail.tooMuch", { amount: money(balance) }) : tooBig ? t("promo.giftDetail.tooBig") : invalid ? t("promo.gc.amountInvalid") : undefined}
          required
        >
          {(a) => <UnitInput id={a.id} describedBy={a["aria-describedby"]} invalid={a["aria-invalid"]} unit="€" value={amount} onChange={setAmount} />}
        </FormField>
        <FormField label={t("promo.giftDetail.reason")} hint={t("promo.giftDetail.reasonHint")} required>
          {(a) => <textarea {...a} rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} className="gt-admin-field" placeholder={t("promo.giftDetail.reasonPlaceholder")} />}
        </FormField>
        <p className="m-0 flex items-center justify-between rounded-[var(--admin-radius-sm)] bg-[var(--admin-panel-sunken)] px-3 py-2 text-[length:var(--text-caption)]">
          <span>{t("promo.giftDetail.balanceAfter")}</span>
          <strong className="tabular-nums">{money(Math.max(0, after))}</strong>
        </p>
        <DialogError message={error} />
      </div>
    </FormDialog>
  );
}

function addMonths(day: string, months: number) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

function ExtendDialog({ expiresAt, busy, error, onClose, onConfirm }: { expiresAt: string; busy: boolean; error: string | null; onClose: () => void; onConfirm: (day: string, note: string) => void }) {
  const { t } = useTranslation();
  const { date } = usePromoDates();
  // From the later of today and the current expiry (an expired card is extended from today).
  const [base] = useState(() => {
    const today = new Date().toISOString().slice(0, 10);
    const current = expiresAt.slice(0, 10);
    return current > today ? current : today;
  });
  const [value, setValue] = useState(() => addMonths(base, 6));
  const [note, setNote] = useState("");
  const valid = value > base;
  return (
    <FormDialog
      open
      icon={CalendarPlus}
      title={t("promo.giftDetail.extendTitle")}
      description={t("promo.giftDetail.extendBody", { date: date(expiresAt) })}
      confirmLabel={t("promo.giftDetail.extendConfirm")}
      cancelLabel={t("promo.common.cancel")}
      onClose={onClose}
      onConfirm={() => onConfirm(value, note)}
      confirmDisabled={!valid}
      loading={busy}
    >
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
        <div className="flex flex-wrap gap-1.5">
          {[3, 6, 12].map((m) => {
            const day = addMonths(base, m);
            return (
              <button
                key={m}
                type="button"
                onClick={() => setValue(day)}
                aria-pressed={value === day}
                className={clsx(
                  "h-8 rounded-[var(--radius-pill)] border px-3 text-[length:var(--text-caption)] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]",
                  value === day ? "border-[var(--gt-ink-900)] bg-[var(--gt-ink-900)] text-[var(--gt-white)]" : "border-[var(--border-default)] hover:border-[var(--gt-ink-400)]",
                )}
              >
                {t("promo.giftDetail.plusMonths", { count: m })}
              </button>
            );
          })}
        </div>
        <FormField label={t("promo.giftDetail.newExpiry")} error={!valid ? t("promo.giftDetail.mustBeLater") : undefined}>
          {(a) => <input {...a} type="date" value={value} min={base} onChange={(e) => setValue(e.target.value)} className="gt-admin-field" />}
        </FormField>
        <FormField label={t("promo.gc.extendNote")}>
          {(a) => <input {...a} type="text" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} className="gt-admin-field" />}
        </FormField>
        <DialogError message={error} />
      </div>
    </FormDialog>
  );
}

function CancelDialog({ card, busy, error, onClose, onConfirm }: { card: AdminGiftCard; busy: boolean; error: string | null; onClose: () => void; onConfirm: (note: string) => void }) {
  const { t } = useTranslation();
  const money = useMoney();
  const [note, setNote] = useState("");
  const [typed, setTyped] = useState("");
  // Irreversible and the customer loses the balance: the note is required and the last 4 characters must be typed.
  const valid = note.trim().length >= 3 && typed.trim().toUpperCase() === card.last4;
  return (
    <FormDialog
      open
      icon={Ban}
      tone="danger"
      title={t("promo.giftDetail.cancelTitle", { code: maskedCode(card.last4) })}
      description={t("promo.giftDetail.cancelBody", { amount: money(card.balanceMinor), name: card.recipientName ?? card.recipientEmail })}
      confirmLabel={t("promo.giftDetail.cancelConfirm")}
      cancelLabel={t("promo.giftDetail.keepCard")}
      onClose={onClose}
      onConfirm={() => valid && onConfirm(note.trim())}
      confirmDisabled={!valid}
      loading={busy}
    >
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
        <p className="m-0 font-semibold">{t("promo.giftDetail.cancelIrreversible")}</p>
        <FormField label={t("promo.giftDetail.reason")} required>
          {(a) => <textarea {...a} rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} className="gt-admin-field" placeholder={t("promo.gc.cancelPlaceholder")} />}
        </FormField>
        <FormField label={t("promo.gc.typeLast4", { last4: card.last4 })} required>
          {(a) => <input {...a} type="text" value={typed} onChange={(e) => setTyped(e.target.value)} className="gt-admin-field font-[family-name:var(--gt-font-mono)]" autoComplete="off" />}
        </FormField>
        <DialogError message={error} />
      </div>
    </FormDialog>
  );
}
