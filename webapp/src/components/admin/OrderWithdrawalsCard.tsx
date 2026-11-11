"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PackageCheck, Undo2 } from "lucide-react";
import { Card } from "./DetailPanels";
import { FormField } from "./FormField";
import { AdminSelect } from "./AdminSelect";
import { Badge, type BadgeTone } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Checkbox } from "../ui/Checkbox";
import { Dialog } from "../ui/Dialog";
import { dateLabel, dateTimeLabel } from "../../lib/withdrawalDates";
import { useFormat } from "../../lib/format";
import { minorToField, parseAmountToMinor } from "../../lib/fulfillmentPlan";
import type { FulfillmentResult, RefundInput } from "../../lib/adminFulfillment";
import {
  fetchWithdrawalOptions,
  findOrderId,
  markReturnReceived,
  refuseWithdrawal,
  type StaffAnswer,
  withdrawalAvailable,
} from "../../lib/orderWithdrawal";
import {
  type DeclaredWithdrawal,
  WITHDRAWAL_REFUSAL_REASONS,
  type WithdrawalOptions,
  type WithdrawalRefusalReason,
} from "../../lib/orderWithdrawalMapping";

/**
 * The order's shop withdrawals in the back office (decision 131): what the
 * customer declared (when, how, which lines, the seal answer), then the team's
 * steps — return received, refund (the existing `refund-order` flow with the
 * withdrawal id: the database takes the declared lines, Stripe confirms), or
 * refusal with a reason the customer reads. Every action is checked by the
 * database (`manage_orders`).
 */

const TONE: Record<DeclaredWithdrawal["status"], BadgeTone> = {
  declared: "warning",
  return_received: "brand",
  refunded: "success",
  refused: "error",
};

export function OrderWithdrawalsCard({
  reference,
  currency,
  refund,
  showToast,
}: {
  reference: string;
  currency: string;
  /** `useAdminOrders().refund`: reloads the order book once requested. */
  refund: (reference: string, input: RefundInput) => Promise<FulfillmentResult>;
  showToast: (title: string, body: string, tone?: "error" | "warning") => void;
}) {
  const { t, i18n } = useTranslation();
  const { formatMoney } = useFormat();
  const lang = i18n.language ?? "fr";
  const [options, setOptions] = useState<WithdrawalOptions | null>(null);
  const [refundFor, setRefundFor] = useState<DeclaredWithdrawal | null>(null);
  const [refuseFor, setRefuseFor] = useState<DeclaredWithdrawal | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const id = await findOrderId(reference);
      setOptions(id ? await fetchWithdrawalOptions(id) : null);
    } catch {
      setOptions(null);
    }
  }, [reference]);

  useEffect(() => {
    if (!withdrawalAvailable()) return;
    void load();
  }, [load]);

  const tell = (answer: StaffAnswer, title: string) => {
    if (answer.ok) showToast(title, t("withdrawal.admin.title"));
    else showToast(title, t(`withdrawal.admin.errors.${answer.reason}`), "error");
  };

  if (!options || options.withdrawals.length === 0) return null;

  return (
    <Card title={t("withdrawal.admin.title")} icon={Undo2}>
      <ul className="m-0 grid list-none gap-3 p-0">
        {options.withdrawals.map((w) => {
          const open = w.status === "declared" || w.status === "return_received";
          const refundPending = w.refundStatus === "pending";
          return (
            <li key={w.id} className="grid gap-2 rounded-[var(--radius-control)] border border-[var(--border-subtle)] p-3">
              <span className="flex flex-wrap items-center gap-2">
                <Badge tone={TONE[w.status]}>{t(`withdrawal.status.${w.status}`)}</Badge>
                {refundPending && <Badge tone="neutral">{t("withdrawal.status.refundPending")}</Badge>}
                <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
                  {t("withdrawal.declaredOn", { date: dateTimeLabel(w.declaredAt, lang) })} · {w.customerName} ·{" "}
                  {t(`withdrawal.admin.via.${w.channel}`)}
                </span>
              </span>
              <ul className="m-0 list-disc pl-5 text-[length:var(--text-body-sm)]">
                {w.items.map((item) => (
                  <li key={item.orderItemId}>
                    {item.productName}
                    {item.variantName ? ` (${item.variantName})` : ""} × {item.quantity}
                  </li>
                ))}
              </ul>
              <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
                {w.deadlineAt ? t("withdrawal.admin.deadline", { date: dateLabel(w.deadlineAt, lang) }) : t("withdrawal.admin.noDeadline")}
              </span>
              {w.status === "refused" && w.refusalReason && (
                <span className="text-[length:var(--text-caption)] text-[var(--status-error-fg)]">
                  {t(`withdrawal.refusal.${w.refusalReason}`)}
                  {w.refusalNote ? ` — ${w.refusalNote}` : ""}
                </span>
              )}
              {open && w.suggestedRefundMinor !== undefined && (
                <span className="text-[length:var(--text-caption)] text-[var(--text-body)]">
                  {t("withdrawal.admin.suggested", { amount: formatMoney(w.suggestedRefundMinor, currency), shipping: "" })}
                </span>
              )}
              {open && !refundPending && (
                <span className="flex flex-wrap gap-2">
                  {w.status === "declared" && (
                    <Button
                      size="sm"
                      variant="outline"
                      iconLeft={PackageCheck}
                      loading={busy === w.id}
                      disabled={busy !== null}
                      onClick={() => {
                        setBusy(w.id);
                        void markReturnReceived(w.id).then((answer) => {
                          setBusy(null);
                          tell(answer, t("withdrawal.admin.returnReceived"));
                          void load();
                        });
                      }}
                    >
                      {t("withdrawal.admin.returnReceived")}
                    </Button>
                  )}
                  <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => setRefundFor(w)}>
                    {t("withdrawal.admin.refund")}
                  </Button>
                  <Button size="sm" variant="dangerOutline" disabled={busy !== null} onClick={() => setRefuseFor(w)}>
                    {t("withdrawal.admin.refuse")}
                  </Button>
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <WithdrawalRefundDialog
        withdrawal={refundFor}
        currency={currency}
        onClose={() => setRefundFor(null)}
        onSubmit={async (amountMinor, restock) => {
          const result = await refund(reference, { amountMinor, reason: "return", lines: [], restock, withdrawalId: refundFor!.id });
          if (result.ok) {
            showToast(t("admin.orders.fulfilment.toastRefundTitle"), t("admin.orders.fulfilment.toastRefundBody"));
            setRefundFor(null);
            void load();
          }
          return result;
        }}
      />
      <WithdrawalRefuseDialog
        withdrawal={refuseFor}
        onClose={() => setRefuseFor(null)}
        onSubmit={async (reason, note) => {
          const answer = await refuseWithdrawal(refuseFor!.id, reason, note);
          if (answer.ok) {
            tell(answer, t("withdrawal.admin.refuse"));
            setRefuseFor(null);
            void load();
          }
          return answer;
        }}
      />
    </Card>
  );
}

function WithdrawalRefundDialog({
  withdrawal,
  currency,
  onClose,
  onSubmit,
}: {
  withdrawal: DeclaredWithdrawal | null;
  currency: string;
  onClose: () => void;
  onSubmit: (amountMinor: number, restock: boolean) => Promise<FulfillmentResult>;
}) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState("");
  const [restock, setRestock] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!withdrawal) return;
    setAmount(minorToField(withdrawal.suggestedRefundMinor ?? 0));
    setRestock(true);
    setBusy(false);
    setError(null);
  }, [withdrawal]);

  const minor = parseAmountToMinor(amount);
  const submit = async () => {
    if (!minor || minor <= 0) return setError(t("withdrawal.admin.errors.invalid"));
    setBusy(true);
    const result = await onSubmit(minor, restock);
    setBusy(false);
    if (!result.ok) setError(t(`admin.orders.fulfilment.error.${result.error}`));
  };

  return (
    <Dialog
      open={withdrawal !== null}
      onClose={onClose}
      title={t("withdrawal.admin.refundTitle")}
      description={t("withdrawal.admin.refundHelp")}
      closeLabel={t("withdrawal.admin.cancel")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t("withdrawal.admin.cancel")}
          </Button>
          <Button onClick={() => void submit()} loading={busy} disabled={busy}>
            {t("withdrawal.admin.refundSubmit")}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <FormField label={`${t("withdrawal.admin.refundAmount")} (${currency})`} error={error ?? undefined}>
          {(field) => (
            <input
              {...field}
              className="gt-admin-field"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          )}
        </FormField>
        <Checkbox label={t("withdrawal.admin.restock")} checked={restock} onChange={setRestock} />
      </div>
    </Dialog>
  );
}

function WithdrawalRefuseDialog({
  withdrawal,
  onClose,
  onSubmit,
}: {
  withdrawal: DeclaredWithdrawal | null;
  onClose: () => void;
  onSubmit: (reason: WithdrawalRefusalReason, note: string) => Promise<StaffAnswer>;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState<WithdrawalRefusalReason>("goods_not_returned");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!withdrawal) return;
    setReason("goods_not_returned");
    setNote("");
    setBusy(false);
    setError(null);
  }, [withdrawal]);

  const submit = async () => {
    if (reason === "other" && !note.trim()) return setError(t("withdrawal.admin.errors.invalid"));
    setBusy(true);
    const answer = await onSubmit(reason, note);
    setBusy(false);
    if (!answer.ok) setError(t(`withdrawal.admin.errors.${answer.reason}`));
  };

  return (
    <Dialog
      open={withdrawal !== null}
      onClose={onClose}
      tone="danger"
      title={t("withdrawal.admin.refuseTitle")}
      closeLabel={t("withdrawal.admin.cancel")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t("withdrawal.admin.cancel")}
          </Button>
          <Button variant="danger" onClick={() => void submit()} loading={busy} disabled={busy}>
            {t("withdrawal.admin.refuseSubmit")}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <FormField label={t("withdrawal.admin.refuseReason")}>
          {(field) => (
            <AdminSelect
              {...field}
              value={reason}
              onChange={(e) => setReason(e.target.value as WithdrawalRefusalReason)}
              options={WITHDRAWAL_REFUSAL_REASONS.map((r) => ({ value: r, label: t(`withdrawal.refusal.${r}`) }))}
            />
          )}
        </FormField>
        <FormField label={t("withdrawal.admin.refuseNote")} error={error ?? undefined} required={reason === "other"}>
          {(field) => (
            <textarea {...field} className="gt-admin-field min-h-24" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          )}
        </FormField>
      </div>
    </Dialog>
  );
}
