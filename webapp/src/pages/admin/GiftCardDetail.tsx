import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import {
  Ban,
  CalendarPlus,
  CircleCheck,
  CircleMinus,
  CirclePlus,
  CreditCard,
  Gift,
  History,
  Hourglass,
  MailWarning,
  Receipt,
  RotateCcw,
  SearchX,
  Send,
  ShoppingBag,
  SlidersHorizontal,
  UserRound,
} from "lucide-react";
import clsx from "clsx";
import { AdminButton } from "../../components/admin/AdminButton";
import { AdminHeader } from "../../components/admin/AdminHeader";
import { AdminSheet, SheetBody, SheetFooter } from "../../components/admin/AdminSheet";
import { ConfirmationDialog } from "../../components/admin/ConfirmationDialog";
import { FormField } from "../../components/admin/FormField";
import { OverflowMenu } from "../../components/admin/OverflowMenu";
import { usePromotions } from "../../lib/adminPromotions";
import { useToast } from "../../lib/toast";
import { parseEuros } from "../../lib/promotionRules";
import {
  daysFromNow,
  giftCardBalance,
  giftCardInitial,
  giftCardStatus,
  type GiftCard,
  type GiftCardTransaction,
} from "../../data/adminPromotions";
import { DeliveryLabel, GiftCardStatusBadge, useMoney, usePromoDates } from "../../components/promotions/PromoBadges";
import { CopyButton, Fact, FormDialog, Notice, Panel, PrototypeBar, Segmented, UnitInput } from "../../components/promotions/PromoUi";
import { GiftCardVisual } from "../../components/promotions/Visuals";
import { PromoEmpty } from "../../components/promotions/PromoEmpty";
import { useAdminShell } from "./AdminLayout";

/**
 * One gift card: the card itself, what is left on it, and every movement.
 *
 * The balance is never typed anywhere — it is the sum of the ledger — so the
 * history below *is* the explanation of the number above it. Every operation
 * that moves money or ends the card's life goes through a dialog that states
 * the consequence, and cancelling asks for the code to be typed: it cannot be
 * undone, and the customer loses the balance.
 */
export function GiftCardDetail() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { code = "" } = useParams();
  const { openNav } = useAdminShell();
  const { showToast } = useToast();
  const store = usePromotions();
  const card = store.getGiftCard(code);
  const money = useMoney();
  const { date, dateTime } = usePromoDates();

  const [dialog, setDialog] = useState<null | "resend" | "adjust" | "extend" | "cancel">(null);
  const [orderOpen, setOrderOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!card) {
    return (
      <>
        <AdminHeader title={t("promo.notFound.card")} onOpenNav={openNav} crumbs={[{ label: t("admin.nav.promotions"), to: "/admin/promotions?vue=cartes-cadeaux" }]} />
        <div className="px-[var(--admin-gutter)] pt-5">
          <div className="gt-admin-panel">
            <PromoEmpty icon={SearchX} tone="neutral" title={t("promo.notFound.card")} body={t("promo.notFound.cardBody", { code })} actions={<AdminButton variant="dark" onClick={() => navigate("/admin/promotions?vue=cartes-cadeaux")}>{t("promo.common.backToCards")}</AdminButton>} />
          </div>
        </div>
      </>
    );
  }

  const status = giftCardStatus(card);
  const balance = Math.max(0, giftCardBalance(card));
  const initial = giftCardInitial(card);
  const closed = status === "cancelled";
  const run = async (fn: () => Promise<void>, toast: string, body?: string, tone: "success" | "info" | "warning" = "success") => {
    setBusy(true);
    await fn();
    setBusy(false);
    setDialog(null);
    showToast(toast, body, tone);
  };

  return (
    <>
      <AdminHeader
        title={card.code}
        description={t("promo.giftDetail.description", { name: card.recipientName })}
        crumbs={[
          { label: t("admin.nav.promotions"), to: "/admin/promotions" },
          { label: t("promo.tabs.giftCards"), to: "/admin/promotions?vue=cartes-cadeaux" },
          { label: card.code },
        ]}
        onOpenNav={openNav}
        actions={
          <>
            <span className="hidden sm:inline-flex">
              <CopyButton value={card.code} label={t("promo.cards.copyCode")} copiedLabel={t("promo.editor.code.copied")} size="md" />
            </span>
            <span><span className="hidden md:inline-flex"><AdminButton variant="outline" iconLeft={Send} onClick={() => setDialog("resend")} disabled={closed || status === "scheduled"}>
              {t("promo.cards.resend")}
            </AdminButton></span></span>
            <OverflowMenu
              label={t("promo.actions.more", { name: card.code })}
              actions={[
                { id: "resend", label: t("promo.cards.resend"), icon: Send, onSelect: () => setDialog("resend"), disabled: closed || status === "scheduled" },
                { id: "adjust", label: t("promo.giftDetail.adjust"), icon: SlidersHorizontal, onSelect: () => setDialog("adjust"), disabled: closed },
                { id: "extend", label: t("promo.giftDetail.extend"), icon: CalendarPlus, onSelect: () => setDialog("extend"), disabled: closed || status === "redeemed" },
                { id: "order", label: t("promo.giftDetail.viewOrder"), icon: Receipt, onSelect: () => setOrderOpen(true) },
                { id: "cancel", label: t("promo.giftDetail.cancel"), icon: Ban, onSelect: () => setDialog("cancel"), tone: "danger", separated: true, disabled: closed },
              ]}
            />
          </>
        }
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 px-[var(--admin-gutter)] pb-[clamp(32px,5vw,56px)] pt-5">
        <PrototypeBar showModes={false} />

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
            <div className={clsx("mx-auto w-full max-w-[420px]", (closed || status === "expired" || status === "redeemed") && "opacity-70 grayscale-[.5]")}>
              <GiftCardVisual design={card.design} amountCents={initial} recipient={card.recipientName} sender={card.senderName} message={card.message} code={card.code} size="lg" />
            </div>
            <section className="gt-admin-panel grid gap-3 p-4 sm:p-5" aria-label={t("promo.giftDetail.balance")}>
              <div className="flex items-start justify-between gap-3">
                <div className="grid grid-cols-[minmax(0,1fr)] gap-0.5">
                  <span className="text-[11px] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)]">{t("promo.giftDetail.currentBalance")}</span>
                  <span key={balance} className="gt-status-swap text-[36px] font-bold leading-none tabular-nums text-[var(--text-primary)]">{money(balance)}</span>
                  <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("promo.giftDetail.ofOriginal", { amount: money(initial) })}</span>
                </div>
                <span key={status} className="gt-status-swap">
                  <GiftCardStatusBadge status={status} size="md" />
                </span>
              </div>
              <span aria-hidden="true" className="block h-2 overflow-hidden rounded-full bg-[var(--gt-ink-100)]">
                <span className="block h-full rounded-full bg-[linear-gradient(90deg,var(--gt-emerald-400),var(--gt-emerald-500))] transition-[width] duration-[var(--duration-slow)]" style={{ width: `${initial ? Math.min(100, (balance / initial) * 100) : 0}%` }} />
              </span>
              <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-body)]">
                {t("promo.giftDetail.spent", { amount: money(Math.max(0, initial - balance)), percent: initial ? Math.round(((initial - balance) / initial) * 100) : 0 })}
              </p>
            </section>
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
            <StateNotice card={card} onExtend={() => setDialog("extend")} onResend={() => setDialog("resend")} />

            <Panel title={t("promo.giftDetail.details")} icon={Gift}>
              <dl className="m-0 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <Fact label={t("promo.cards.code")} mono value={<span className="flex items-center gap-1">{card.code}<CopyButton iconOnly value={card.code} label={t("promo.cards.copyCode")} copiedLabel={t("promo.editor.code.copied")} /></span>} />
                <Fact label={t("promo.giftDetail.currentBalance")} value={money(balance)} />
                <Fact label={t("promo.cards.initial")} value={money(initial)} />
                <Fact label={t("promo.cards.purchaser")} value={<span className="grid">{card.purchaserName}<span className="text-[11px] text-[var(--text-muted)]">{card.purchaserEmail}</span></span>} />
                <Fact label={t("promo.cards.recipient")} value={<span className="grid">{card.recipientName}<span className="text-[11px] text-[var(--text-muted)]">{card.recipientEmail}</span></span>} />
                <Fact label={t("promo.cards.delivery")} value={<DeliveryLabel status={card.delivery} />} />
                <Fact label={t("promo.cards.purchased")} value={dateTime(card.purchasedAt)} />
                <Fact label={t("promo.giftDetail.deliveryDate")} value={dateTime(card.deliverAt)} />
                <Fact label={t("promo.cards.expires")} value={date(card.expiresAt)} />
                <Fact label={t("promo.cards.status")} value={<GiftCardStatusBadge status={status} />} />
                <Fact
                  label={t("promo.giftDetail.order")}
                  value={
                    <button type="button" onClick={() => setOrderOpen(true)} className="rounded-[2px] font-[family-name:var(--gt-font-mono)] text-[length:var(--text-caption)] font-semibold underline underline-offset-2 hover:text-[var(--accent-highlight-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]">
                      {card.orderRef}
                    </button>
                  }
                />
                <Fact label={t("promo.giftDetail.design")} value={t(`promo.design.${card.design}`)} />
              </dl>
              {card.message && (
                <blockquote className="m-0 rounded-[var(--admin-radius-sm)] border-l-[3px] border-[var(--gt-fuchsia-300)] bg-[var(--gt-fuchsia-50)] px-4 py-3 text-[length:var(--text-body-sm)] italic text-[var(--text-body)]">
                  “{card.message}” <span className="not-italic text-[var(--text-muted)]">— {card.senderName}</span>
                </blockquote>
              )}
            </Panel>

            <Ledger card={card} />
          </div>
        </div>
      </div>

      {dialog === "resend" && (
        <ResendDialog open={dialog === "resend"} card={card} busy={busy} onClose={() => setDialog(null)} onConfirm={(email) => run(() => store.resendGiftCard(card.code, email !== card.recipientEmail ? email : undefined), t("promo.toast.resent", { email }))} />
      )}
      {dialog === "adjust" && (
      <AdjustDialog
        open={dialog === "adjust"}
        balance={balance}
        busy={busy}
        onClose={() => setDialog(null)}
        onConfirm={(delta, note) => run(() => store.adjustGiftCard(card.code, delta, note), t("promo.toast.adjusted", { amount: `${delta > 0 ? "+" : "−"}${money(Math.abs(delta))}` }), note, delta < 0 ? "warning" : "success")}
      />
      )}
      {dialog === "extend" && (
        <ExtendDialog open={dialog === "extend"} card={card} busy={busy} onClose={() => setDialog(null)} onConfirm={(expiresAt) => run(() => store.extendGiftCard(card.code, expiresAt), t("promo.toast.extended", { date: date(expiresAt) }))} />
      )}
      {dialog === "cancel" && (
        <CancelDialog open={dialog === "cancel"} card={card} balance={balance} busy={busy} onClose={() => setDialog(null)} onConfirm={(note) => run(() => store.cancelGiftCard(card.code, note), t("promo.toast.cardCancelled", { code: card.code }), t("promo.toast.cardCancelledBody", { amount: money(balance) }), "warning")} />
      )}
      <OrderSheet open={orderOpen} card={card} onClose={() => setOrderOpen(false)} />
    </>
  );
}

function StateNotice({ card, onExtend, onResend }: { card: GiftCard; onExtend: () => void; onResend: () => void }) {
  const { t } = useTranslation();
  const money = useMoney();
  const { date, dateTime } = usePromoDates();
  const status = giftCardStatus(card);
  const balance = giftCardBalance(card);
  const last = [...card.ledger].reverse().find((tx) => tx.kind === "redemption");

  if (status === "cancelled") {
    const cancel = card.ledger.find((tx) => tx.kind === "cancellation");
    return (
      <Notice tone="error" icon={Ban} title={t("promo.giftDetail.cancelledTitle", { date: cancel ? date(cancel.at) : "" })}>
        {cancel?.note}
      </Notice>
    );
  }
  if (status === "redeemed")
    return (
      <Notice tone="success" icon={CircleCheck} title={t("promo.giftDetail.redeemedTitle")}>
        {last ? t("promo.giftDetail.redeemedBody", { date: date(last.at), order: last.orderRef }) : null}
      </Notice>
    );
  if (status === "expired")
    return (
      <Notice tone="warning" icon={Hourglass} title={t("promo.giftDetail.expiredTitle", { date: date(card.expiresAt), amount: money(balance) })} action={<AdminButton size="sm" variant="dark" iconLeft={CalendarPlus} onClick={onExtend}>{t("promo.giftDetail.extend")}</AdminButton>}>
        {t("promo.giftDetail.expiredBody")}
      </Notice>
    );
  if (status === "scheduled")
    return (
      <Notice tone="info" icon={Send} title={t("promo.giftDetail.scheduledTitle", { date: dateTime(card.deliverAt) })}>
        {t("promo.giftDetail.scheduledBody", { email: card.recipientEmail })}
      </Notice>
    );
  if (card.delivery === "bounced")
    return (
      <Notice tone="error" icon={MailWarning} title={t("promo.giftDetail.bouncedTitle", { email: card.recipientEmail })} action={<AdminButton size="sm" variant="dark" iconLeft={Send} onClick={onResend}>{t("promo.giftDetail.fixAndResend")}</AdminButton>}>
        {t("promo.giftDetail.bouncedBody")}
      </Notice>
    );
  const days = daysFromNow(card.expiresAt);
  if (days <= 45)
    return (
      <Notice tone="warning" icon={Hourglass} title={t("promo.giftDetail.expiringTitle", { count: days })} action={<AdminButton size="sm" variant="outline" iconLeft={CalendarPlus} onClick={onExtend}>{t("promo.giftDetail.extend")}</AdminButton>}>
        {t("promo.giftDetail.expiringBody", { amount: money(balance) })}
      </Notice>
    );
  return null;
}

const TX_META: Record<GiftCardTransaction["kind"], { icon: typeof Gift; tone: string }> = {
  purchase: { icon: Gift, tone: "bg-[var(--gt-fuchsia-50)] text-[var(--accent-highlight-ink)]" },
  redemption: { icon: ShoppingBag, tone: "bg-[var(--gt-blue-100)] text-[var(--gt-blue-700)]" },
  adjustment: { icon: SlidersHorizontal, tone: "bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)]" },
  extension: { icon: CalendarPlus, tone: "bg-[var(--status-info-bg)] text-[var(--status-info-fg)]" },
  cancellation: { icon: Ban, tone: "bg-[var(--status-error-bg)] text-[var(--status-error-fg)]" },
  resend: { icon: Send, tone: "bg-[var(--surface-sunken)] text-[var(--text-body)]" },
};

/** The ledger, oldest first, with the running balance after each line. */
function Ledger({ card }: { card: GiftCard }) {
  const { t } = useTranslation();
  const money = useMoney();
  const { dateTime, date } = usePromoDates();
  // Running balance after each line, computed without mutating across renders.
  const rows = card.ledger.map((tx, i) => ({
    tx,
    after: card.ledger.slice(0, i + 1).reduce((sum, t) => sum + t.amountCents, 0),
  }));
  const running = rows.length ? rows[rows.length - 1].after : 0;

  return (
    <Panel title={t("promo.giftDetail.history")} icon={History}>
      <ol className="m-0 grid list-none p-0">
        {rows.map(({ tx, after }, i) => {
          const meta = TX_META[tx.kind];
          const Icon = meta.icon;
          return (
            <li key={tx.id} className="relative grid grid-cols-[32px_minmax(0,1fr)_auto] items-start gap-3 pb-5">
              {i < rows.length && <span aria-hidden="true" className="absolute left-[15px] top-8 h-[calc(100%-28px)] w-px bg-[var(--border-subtle)]" />}
              <span aria-hidden="true" className={clsx("grid h-8 w-8 place-items-center rounded-full", meta.tone)}>
                <Icon size={15} strokeWidth={1.9} />
              </span>
              <div className="grid grid-cols-[minmax(0,1fr)] gap-0.5">
                <span className="text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">
                  {t(`promo.ledger.${tx.kind}`)}
                  {tx.orderRef && tx.kind !== "purchase" && <span className="font-normal text-[var(--text-muted)]"> · {tx.orderRef}</span>}
                </span>
                <span className="text-[11px] text-[var(--text-muted)]">
                  {tx.actor} · <time dateTime={tx.at}>{dateTime(tx.at)}</time>
                </span>
                {tx.note && tx.kind !== "extension" && <span className="text-[length:var(--text-caption)] text-[var(--text-body)]">{tx.note}</span>}
                {tx.kind === "extension" && tx.note && <span className="text-[length:var(--text-caption)] text-[var(--text-body)]">{t("promo.ledger.extendedTo", { date: date(tx.note) })}</span>}
              </div>
              <div className="grid justify-items-end gap-0.5 text-right">
                {tx.amountCents !== 0 && (
                  <span className={clsx("text-[length:var(--text-body-sm)] font-bold tabular-nums", tx.amountCents > 0 ? "text-[var(--status-success-fg)]" : "text-[var(--text-primary)]")}>
                    {tx.amountCents > 0 ? "+" : "−"}
                    {money(Math.abs(tx.amountCents))}
                  </span>
                )}
                <span className="text-[11px] tabular-nums text-[var(--text-muted)]">{t("promo.ledger.after", { amount: money(Math.max(0, after)) })}</span>
              </div>
            </li>
          );
        })}
        <li className="grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 rounded-[var(--admin-radius-sm)] bg-[var(--admin-panel-sunken)] p-2">
          <span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-full bg-[var(--gt-ink-900)] text-[var(--gt-white)]">
            <CircleCheck size={15} />
          </span>
          <span className="text-[length:var(--text-body-sm)] font-semibold">{t("promo.ledger.remaining")}</span>
          <span className="text-[length:var(--text-body-md)] font-bold tabular-nums">{money(Math.max(0, running))}</span>
        </li>
      </ol>
    </Panel>
  );
}

/* -------------------------------------------------------------------------- */
/* Dialogs                                                                    */
/* -------------------------------------------------------------------------- */

function ResendDialog({ open, card, busy, onClose, onConfirm }: { open: boolean; card: GiftCard; busy: boolean; onClose: () => void; onConfirm: (email: string) => void }) {
  const { t } = useTranslation();
  const [email, setEmail] = useState(card.recipientEmail);
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  return (
    <FormDialog open={open} icon={Send} title={t("promo.giftDetail.resendTitle")} description={t("promo.giftDetail.resendBody")} confirmLabel={t("promo.cards.resend")} cancelLabel={t("promo.common.cancel")} onClose={onClose} onConfirm={() => onConfirm(email.trim())} confirmDisabled={!valid} loading={busy}>
      <FormField label={t("promo.giftDetail.recipientEmail")} error={email && !valid ? t("promo.validation.email") : undefined} hint={card.delivery === "bounced" ? t("promo.giftDetail.bouncedHint") : undefined}>
        {(a) => <input {...a} type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="gt-admin-field" autoComplete="off" />}
      </FormField>
    </FormDialog>
  );
}

function AdjustDialog({ open, balance, busy, onClose, onConfirm }: { open: boolean; balance: number; busy: boolean; onClose: () => void; onConfirm: (delta: number, note: string) => void }) {
  const { t } = useTranslation();
  const money = useMoney();
  const [direction, setDirection] = useState<"add" | "remove">("add");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const cents = parseEuros(amount);
  const tooMuch = direction === "remove" && cents != null && cents > balance;
  const tooBig = direction === "add" && cents != null && cents > 50000;
  const valid = cents != null && cents > 0 && !tooMuch && !tooBig && note.trim().length >= 5;
  const after = cents ? balance + (direction === "add" ? cents : -cents) : balance;

  return (
    <FormDialog
      open={open}
      icon={SlidersHorizontal}
      tone={direction === "remove" ? "danger" : "default"}
      title={t("promo.giftDetail.adjustTitle")}
      description={t("promo.giftDetail.adjustBody")}
      confirmLabel={direction === "add" ? t("promo.giftDetail.adjustAdd", { amount: cents ? money(cents) : "" }) : t("promo.giftDetail.adjustRemove", { amount: cents ? money(cents) : "" })}
      cancelLabel={t("promo.common.cancel")}
      onClose={onClose}
      onConfirm={() => cents && onConfirm(direction === "add" ? cents : -cents, note.trim())}
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
        <FormField label={t("promo.giftDetail.amount")} error={tooMuch ? t("promo.giftDetail.tooMuch", { amount: money(balance) }) : tooBig ? t("promo.giftDetail.tooBig") : undefined} required>
          {(a) => <UnitInput id={a.id} describedBy={a["aria-describedby"]} invalid={a["aria-invalid"]} unit="€" value={amount} onChange={setAmount} />}
        </FormField>
        <FormField label={t("promo.giftDetail.reason")} hint={t("promo.giftDetail.reasonHint")} required>
          {(a) => <textarea {...a} rows={2} value={note} onChange={(e) => setNote(e.target.value)} className="gt-admin-field" placeholder={t("promo.giftDetail.reasonPlaceholder")} />}
        </FormField>
        <p className="m-0 flex items-center justify-between rounded-[var(--admin-radius-sm)] bg-[var(--admin-panel-sunken)] px-3 py-2 text-[length:var(--text-caption)]">
          <span>{t("promo.giftDetail.balanceAfter")}</span>
          <strong className="tabular-nums">{money(Math.max(0, after))}</strong>
        </p>
      </div>
    </FormDialog>
  );
}

function addMonthsTo(date: string, months: number) {
  const d = new Date(`${date.slice(0, 10)}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

function ExtendDialog({ open, card, busy, onClose, onConfirm }: { open: boolean; card: GiftCard; busy: boolean; onClose: () => void; onConfirm: (expiresAt: string) => void }) {
  const { t } = useTranslation();
  const { date } = usePromoDates();
  const base = giftCardStatus(card) === "expired" ? "2027-11-24" : card.expiresAt.slice(0, 10);
  const [value, setValue] = useState(addMonthsTo(base, 6));
  const valid = value > card.expiresAt.slice(0, 10);
  return (
    <FormDialog open={open} icon={CalendarPlus} title={t("promo.giftDetail.extendTitle")} description={t("promo.giftDetail.extendBody", { date: date(card.expiresAt) })} confirmLabel={t("promo.giftDetail.extendConfirm")} cancelLabel={t("promo.common.cancel")} onClose={onClose} onConfirm={() => onConfirm(`${value}T23:59`)} confirmDisabled={!valid} loading={busy}>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
        <div className="flex flex-wrap gap-1.5">
          {[3, 6, 12].map((m) => (
            <button key={m} type="button" onClick={() => setValue(addMonthsTo(base, m))} aria-pressed={value === addMonthsTo(base, m)} className={clsx("h-8 rounded-[var(--radius-pill)] border px-3 text-[length:var(--text-caption)] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]", value === addMonthsTo(base, m) ? "border-[var(--gt-ink-900)] bg-[var(--gt-ink-900)] text-[var(--gt-white)]" : "border-[var(--border-default)] hover:border-[var(--gt-ink-400)]")}>
              {t("promo.giftDetail.plusMonths", { count: m })}
            </button>
          ))}
        </div>
        <FormField label={t("promo.giftDetail.newExpiry")} error={!valid ? t("promo.giftDetail.mustBeLater") : undefined}>
          {(a) => <input {...a} type="date" value={value} min={card.expiresAt.slice(0, 10)} onChange={(e) => setValue(e.target.value)} className="gt-admin-field" />}
        </FormField>
      </div>
    </FormDialog>
  );
}

function CancelDialog({ open, card, balance, busy, onClose, onConfirm }: { open: boolean; card: GiftCard; balance: number; busy: boolean; onClose: () => void; onConfirm: (note: string) => void }) {
  const { t } = useTranslation();
  const money = useMoney();
  return (
    <ConfirmationDialog
      open={open}
      icon={Ban}
      tone="danger"
      title={t("promo.giftDetail.cancelTitle", { code: card.code })}
      body={
        <>
          <p className="m-0">{t("promo.giftDetail.cancelBody", { amount: money(balance), name: card.recipientName })}</p>
          <p className="m-0 mt-2 font-semibold">{t("promo.giftDetail.cancelIrreversible")}</p>
        </>
      }
      confirmPhrase={card.code}
      confirmPhraseLabel={t("promo.giftDetail.typeCode", { code: card.code })}
      confirmLabel={t("promo.giftDetail.cancelConfirm")}
      cancelLabel={t("promo.giftDetail.keepCard")}
      loading={busy}
      onCancel={onClose}
      onConfirm={() => onConfirm(t("promo.giftDetail.cancelNote"))}
    />
  );
}

/** The purchase order, as a side sheet: enough to answer a support question without leaving the card. */
function OrderSheet({ open, card, onClose }: { open: boolean; card: GiftCard; onClose: () => void }) {
  const { t } = useTranslation();
  const money = useMoney();
  const { dateTime } = usePromoDates();
  const initial = giftCardInitial(card);
  return (
    <AdminSheet open={open} onClose={onClose} title={t("promo.giftDetail.orderTitle", { ref: card.orderRef })} description={dateTime(card.purchasedAt)} closeLabel={t("promo.common.close")} width={480}>
      <SheetBody>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
          <Notice tone="info" title={t("promo.giftDetail.orderMock")} />
          <dl className="m-0 grid grid-cols-2 gap-4">
            <Fact label={t("promo.giftDetail.customer")} value={<span className="inline-flex items-center gap-1.5"><UserRound size={13} aria-hidden="true" />{card.purchaserName}</span>} />
            <Fact label={t("promo.giftDetail.payment")} value={<span className="inline-flex items-center gap-1.5"><CreditCard size={13} aria-hidden="true" />Visa •• 4821</span>} />
          </dl>
          <ul className="m-0 grid list-none gap-3 border-y border-[var(--border-subtle)] p-0 py-4">
            <li className="flex items-center gap-3">
              <span className="w-16 flex-none"><GiftCardVisual design={card.design} amountCents={initial} size="sm" label="" /></span>
              <span className="grid flex-1 leading-tight">
                <span className="font-semibold">{t("promo.giftDetail.orderLine")}</span>
                <span className="text-[11px] text-[var(--text-muted)]">{t("promo.visual.for", { name: card.recipientName })} · {card.code}</span>
              </span>
              <span className="font-semibold tabular-nums">{money(initial)}</span>
            </li>
          </ul>
          <dl className="m-0 grid gap-1.5 text-[length:var(--text-body-sm)]">
            <div className="flex justify-between"><dt>{t("promo.shop.subtotal")}</dt><dd className="m-0 tabular-nums">{money(initial)}</dd></div>
            <div className="flex justify-between"><dt>{t("promo.shop.shipping")}</dt><dd className="m-0">{t("promo.giftDetail.emailDelivery")}</dd></div>
            <div className="flex justify-between border-t border-[var(--border-subtle)] pt-2 font-bold"><dt>{t("promo.shop.total")}</dt><dd className="m-0 tabular-nums">{money(initial)}</dd></div>
          </dl>
          <p className="m-0 text-[11px] text-[var(--text-muted)]">{t("promo.giftDetail.vatNote")}</p>
        </div>
      </SheetBody>
      <SheetFooter>
        <AdminButton variant="outline" iconLeft={RotateCcw} onClick={onClose}>
          {t("promo.common.close")}
        </AdminButton>
      </SheetFooter>
    </AdminSheet>
  );
}
