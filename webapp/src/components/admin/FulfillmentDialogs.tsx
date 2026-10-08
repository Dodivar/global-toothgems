import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Package, RotateCcw, TriangleAlert } from "lucide-react";
import clsx from "clsx";
import { Dialog } from "../ui/Dialog";
import { Button } from "../ui/Button";
import { Checkbox } from "../ui/Checkbox";
import { FormField } from "./FormField";
import { AdminSelect } from "./AdminSelect";
import type { AdminOrder } from "../../data/adminOrders";
import type { OrderParcel, RefundReason } from "../../data/orders";
import { pick } from "../../data/types";
import { useFormat } from "../../lib/format";
import { CARRIERS, isTrackingUrl, suggestedTrackingUrl } from "../../lib/carriers";
import {
  lineBalances,
  minorToField,
  parseAmountToMinor,
  refundableMinor,
  suggestedRefundMinor,
} from "../../lib/fulfillmentPlan";
import type { FulfillmentResult, ParcelChange, ParcelInput, RefundInput } from "../../lib/adminFulfillment";

/**
 * The two forms of the order desk: a parcel (create, or correct its carrier
 * and tracking), and a card refund.
 *
 * Both only collect and pre-check: what can still be shipped or refunded is
 * the database's to enforce, and a refund is only *requested* here — Stripe's
 * webhook confirms it (see `lib/adminFulfillment.ts`). A refusal comes back as
 * a reason, shown in the dialog so nothing typed is lost.
 */

const OTHER = "__other__";

const FIELD = "gt-admin-field";

function lineLabel(order: AdminOrder, lineId: string, lang: string): string {
  const line = order.lines.find((l) => l.id === lineId);
  return line ? pick(line.name, lang) + (line.variant ? ` — ${pick(line.variant, lang)}` : "") : "—";
}

function QuantityInput({
  value,
  max,
  label,
  onChange,
}: {
  value: number;
  max: number;
  label: string;
  onChange: (value: number) => void;
}) {
  return (
    <input
      type="number"
      inputMode="numeric"
      min={0}
      max={max}
      value={value}
      aria-label={label}
      onChange={(e) => onChange(Math.min(Math.max(Math.trunc(Number(e.target.value) || 0), 0), max))}
      className={clsx(FIELD, "w-20 text-center tabular-nums")}
    />
  );
}

/* -------------------------------------------------------------------------- */

/** Create a parcel (no `parcel`), or correct / complete one that has not arrived. */
export function ParcelDialog({
  order,
  parcel,
  intent,
  open,
  onClose,
  onCreate,
  onChange,
}: {
  order: AdminOrder;
  /** The parcel being edited; absent when creating one. */
  parcel?: OrderParcel;
  /** `ship`: the edit also sends a preparing parcel on its way. */
  intent?: "ship";
  open: boolean;
  onClose: () => void;
  onCreate: (input: ParcelInput) => Promise<FulfillmentResult>;
  onChange: (parcel: OrderParcel, change: ParcelChange) => Promise<FulfillmentResult>;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const balances = useMemo(() => lineBalances(order), [order]);

  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [carrierChoice, setCarrierChoice] = useState<string>(CARRIERS[0].name);
  const [carrierOther, setCarrierOther] = useState("");
  const [service, setService] = useState("");
  const [number, setNumber] = useState("");
  const [url, setUrl] = useState("");
  const [urlEdited, setUrlEdited] = useState(false);
  const [eta, setEta] = useState("");
  const [shipNow, setShipNow] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState<string | null>(null);

  // Start from the order (create) or the parcel (edit) every time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setQuantities(Object.fromEntries(balances.map((b) => [b.lineId, b.toShip])));
    const known = CARRIERS.some((c) => c.name === parcel?.carrier);
    setCarrierChoice(parcel?.carrier ? (known ? parcel.carrier : OTHER) : CARRIERS[0].name);
    setCarrierOther(parcel?.carrier && !known ? parcel.carrier : "");
    setService(parcel?.service ?? "");
    setNumber(parcel?.trackingNumber ?? "");
    setUrl(parcel?.trackingUrl ?? "");
    setUrlEdited(Boolean(parcel?.trackingUrl));
    setEta(parcel?.estimatedDelivery ?? "");
    setShipNow(true);
    setBusy(false);
    setReason(null);
  }, [open, parcel, balances]);

  const carrier = carrierChoice === OTHER ? carrierOther.trim() : carrierChoice;
  const suggestion = suggestedTrackingUrl(carrier, number);

  // The tracking page follows the carrier and number until the team types its own.
  useEffect(() => {
    if (!urlEdited) setUrl(suggestion);
  }, [suggestion, urlEdited]);

  const editing = Boolean(parcel);
  const shipping = editing ? intent === "ship" : shipNow;
  const lines = balances.filter((b) => b.toShip > 0);
  const chosen = lines.filter((b) => (quantities[b.lineId] ?? 0) > 0);

  const errors: { carrier?: string; number?: string; url?: string; lines?: string } = {};
  if (shipping && !carrier) errors.carrier = t("admin.orders.fulfilment.errorCarrier");
  if (shipping && number.trim().length < 3) errors.number = t("admin.orders.fulfilment.errorNumber");
  if (!isTrackingUrl(url)) errors.url = t("admin.orders.fulfilment.errorUrl");
  if (!editing && chosen.length === 0) errors.lines = t("admin.orders.fulfilment.errorLines");
  const invalid = Object.keys(errors).length > 0;

  const submit = async () => {
    if (invalid || busy) return;
    setBusy(true);
    setReason(null);
    const details = {
      carrier,
      service,
      trackingNumber: number,
      trackingUrl: url,
      estimatedDelivery: eta,
    };
    const result = editing
      ? await onChange(parcel!, { status: intent === "ship" ? "shipped" : (parcel!.status as ParcelChange["status"]), ...details })
      : await onCreate({
          lines: chosen.map((b) => ({ orderItemId: b.lineId, quantity: quantities[b.lineId] })),
          status: shipNow ? "shipped" : "preparing",
          ...details,
        });
    setBusy(false);
    if (result.ok) onClose();
    else setReason(result.error);
  };

  const title = editing
    ? intent === "ship"
      ? t("admin.orders.fulfilment.shipTitle")
      : t("admin.orders.fulfilment.editTitle")
    : t("admin.orders.fulfilment.createTitle");

  return (
    <Dialog
      open={open}
      onClose={onClose}
      closeLabel={t("common.close")}
      size="lg"
      icon={<Package size={17} aria-hidden="true" />}
      title={title}
      description={t("admin.orders.fulfilment.parcelBody", { reference: `#${order.reference}` })}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t("admin.orders.dialogKeep")}
          </Button>
          <Button size="sm" className="ml-auto" disabled={invalid || busy} onClick={() => void submit()}>
            {shipping ? t("admin.orders.fulfilment.confirmShip") : t("admin.orders.fulfilment.confirmSave")}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {!editing && (
          <fieldset className="m-0 grid gap-2 border-0 p-0">
            <legend className="mb-1 text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)]">
              {t("admin.orders.fulfilment.linesLegend")}
            </legend>
            {lines.map((b) => (
              <div
                key={b.lineId}
                className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-2.5"
              >
                <span className="min-w-0 text-[length:var(--text-body-sm)] text-[var(--text-primary)]">
                  {lineLabel(order, b.lineId, lang)}
                  <span className="block text-[length:var(--text-caption)] text-[var(--text-muted)]">
                    {t("admin.orders.fulfilment.toShip", { count: b.toShip })}
                  </span>
                </span>
                <QuantityInput
                  value={quantities[b.lineId] ?? 0}
                  max={b.toShip}
                  label={t("admin.orders.fulfilment.quantityOf", { name: lineLabel(order, b.lineId, lang) })}
                  onChange={(value) => setQuantities((q) => ({ ...q, [b.lineId]: value }))}
                />
              </div>
            ))}
            {errors.lines && (
              <p className="m-0 text-[length:var(--text-caption)] font-medium text-[var(--status-error-fg)]">{errors.lines}</p>
            )}
          </fieldset>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label={t("admin.orders.shippingCarrier")} required={shipping} error={errors.carrier}>
            {(props) => (
              <AdminSelect
                {...props}
                value={carrierChoice}
                onChange={(e) => setCarrierChoice(e.target.value)}
                options={[
                  ...CARRIERS.map((c) => ({ value: c.name, label: c.name })),
                  { value: OTHER, label: t("admin.orders.fulfilment.carrierOther") },
                ]}
              />
            )}
          </FormField>
          {carrierChoice === OTHER && (
            <FormField label={t("admin.orders.fulfilment.carrierName")} required={shipping}>
              {(props) => (
                <input {...props} className={FIELD} maxLength={60} value={carrierOther} onChange={(e) => setCarrierOther(e.target.value)} />
              )}
            </FormField>
          )}
          <FormField label={t("admin.orders.fulfilment.service")} hint={t("admin.orders.fulfilment.serviceHint")}>
            {(props) => <input {...props} className={FIELD} maxLength={60} value={service} onChange={(e) => setService(e.target.value)} />}
          </FormField>
          <FormField label={t("admin.orders.shippingTracking")} required={shipping} error={errors.number}>
            {(props) => (
              <input {...props} className={clsx(FIELD, "font-mono")} maxLength={60} value={number} onChange={(e) => setNumber(e.target.value)} />
            )}
          </FormField>
          <FormField
            label={t("admin.orders.fulfilment.trackingUrl")}
            hint={t("admin.orders.fulfilment.trackingUrlHint")}
            error={errors.url}
          >
            {(props) => (
              <input
                {...props}
                type="url"
                inputMode="url"
                className={FIELD}
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setUrlEdited(true);
                }}
              />
            )}
          </FormField>
          <FormField label={t("admin.orders.fulfilment.estimatedDelivery")}>
            {(props) => <input {...props} type="date" className={FIELD} value={eta} onChange={(e) => setEta(e.target.value)} />}
          </FormField>
        </div>

        {!editing && (
          <Checkbox
            checked={shipNow}
            onChange={setShipNow}
            label={t("admin.orders.fulfilment.shipNow")}
            description={t("admin.orders.fulfilment.shipNowHint")}
          />
        )}
        {shipping && order.customer.id.startsWith("guest:") && !url.trim() && (
          <p className="m-0 flex items-start gap-2 rounded-[var(--radius-sm)] border border-[var(--gt-amber-400)] bg-[var(--status-warning-bg)] p-2.5 text-[length:var(--text-caption)] text-[var(--status-warning-fg)]">
            <TriangleAlert size={13} aria-hidden="true" className="mt-0.5 flex-none" />
            {t("admin.orders.fulfilment.guestNoLink")}
          </p>
        )}
        {shipping && <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("admin.orders.fulfilment.emailNote")}</p>}

        {reason && (
          <p role="alert" className="m-0 text-[length:var(--text-body-sm)] font-medium text-[var(--status-error-fg)]">
            {t(`admin.orders.fulfilment.error.${reason}`)}
          </p>
        )}
      </div>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */

const REASONS: RefundReason[] = [
  "requested_by_customer",
  "return",
  "defective",
  "not_received",
  "duplicate",
  "fraudulent",
  "goodwill",
  "other",
];

/** Refund by card, in full or in part, with the lines coming back. */
export function RefundDialog({
  order,
  open,
  onClose,
  onSubmit,
}: {
  order: AdminOrder;
  open: boolean;
  onClose: () => void;
  onSubmit: (input: RefundInput) => Promise<FulfillmentResult>;
}) {
  const { t, i18n } = useTranslation();
  const { formatMoney } = useFormat();
  const lang = i18n.language;
  const balances = useMemo(() => lineBalances(order).filter((b) => b.refundable > 0), [order]);
  const max = refundableMinor(order);

  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [amount, setAmount] = useState("");
  const [amountEdited, setAmountEdited] = useState(false);
  const [reasonKey, setReasonKey] = useState<RefundReason>("requested_by_customer");
  const [restock, setRestock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuantities({});
    setAmount(minorToField(max));
    setAmountEdited(false);
    setReasonKey("requested_by_customer");
    setRestock(false);
    setBusy(false);
    setRefusal(null);
  }, [open, max]);

  const picks = balances
    .map((b) => ({ lineId: b.lineId, qty: quantities[b.lineId] ?? 0 }))
    .filter((p) => p.qty > 0);

  // The amount follows the lines picked until the team types its own.
  useEffect(() => {
    if (open && !amountEdited && picks.length > 0) setAmount(minorToField(suggestedRefundMinor(order, picks)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, amountEdited, JSON.stringify(picks)]);

  const minor = parseAmountToMinor(amount);
  const amountError =
    minor === null
      ? t("admin.orders.fulfilment.errorAmount")
      : minor > max
        ? t("admin.orders.fulfilment.errorAmountMax", { max: formatMoney(max, order.currency) })
        : undefined;
  const full = minor !== null && minor === max;

  const submit = async () => {
    if (minor === null || amountError || busy) return;
    setBusy(true);
    setRefusal(null);
    const result = await onSubmit({
      amountMinor: minor,
      reason: reasonKey,
      lines: picks.map((p) => ({ orderItemId: p.lineId, quantity: p.qty })),
      restock: restock && picks.length > 0,
    });
    setBusy(false);
    if (result.ok) onClose();
    else setRefusal(result.error);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      closeLabel={t("common.close")}
      size="lg"
      tone="danger"
      icon={<RotateCcw size={17} aria-hidden="true" />}
      title={t("admin.orders.fulfilment.refundTitle")}
      description={t("admin.orders.fulfilment.refundBody", { reference: `#${order.reference}`, max: formatMoney(max, order.currency) })}
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose}>
            {t("admin.orders.dialogKeep")}
          </Button>
          <Button size="sm" className="ml-auto" disabled={Boolean(amountError) || busy} onClick={() => void submit()}>
            {t("admin.orders.fulfilment.refundConfirm", { amount: minor === null ? "—" : formatMoney(minor, order.currency) })}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {balances.length > 0 && (
          <fieldset className="m-0 grid gap-2 border-0 p-0">
            <legend className="mb-1 text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)]">
              {t("admin.orders.fulfilment.refundLinesLegend")}
            </legend>
            {balances.map((b) => (
              <div
                key={b.lineId}
                className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-2.5"
              >
                <span className="min-w-0 text-[length:var(--text-body-sm)] text-[var(--text-primary)]">
                  {lineLabel(order, b.lineId, lang)}
                  <span className="block text-[length:var(--text-caption)] text-[var(--text-muted)]">
                    {t("admin.orders.fulfilment.refundable", { count: b.refundable })}
                  </span>
                </span>
                <QuantityInput
                  value={quantities[b.lineId] ?? 0}
                  max={b.refundable}
                  label={t("admin.orders.fulfilment.quantityOf", { name: lineLabel(order, b.lineId, lang) })}
                  onChange={(value) => setQuantities((q) => ({ ...q, [b.lineId]: value }))}
                />
              </div>
            ))}
            <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("admin.orders.fulfilment.refundLinesHint")}</p>
          </fieldset>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label={t("admin.orders.fulfilment.refundAmount", { currency: order.currency })} required error={amountError}>
            {(props) => (
              <input
                {...props}
                inputMode="decimal"
                className={clsx(FIELD, "tabular-nums")}
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  setAmountEdited(true);
                }}
              />
            )}
          </FormField>
          <FormField label={t("admin.orders.refundReasonLabel")} required>
            {(props) => (
              <AdminSelect
                {...props}
                value={reasonKey}
                onChange={(e) => setReasonKey(e.target.value as RefundReason)}
                options={REASONS.map((r) => ({ value: r, label: t(`admin.orders.refundReason.${r}`) }))}
              />
            )}
          </FormField>
        </div>

        {picks.length > 0 && (
          <Checkbox
            checked={restock}
            onChange={setRestock}
            label={t("admin.orders.fulfilment.restock")}
            description={t("admin.orders.fulfilment.restockHint")}
          />
        )}

        <ul className="m-0 grid list-none gap-1.5 p-0 text-[length:var(--text-caption)] text-[var(--text-body)]">
          <li>{t("admin.orders.fulfilment.refundNoteStripe")}</li>
          <li>{t("admin.orders.fulfilment.refundNoteEmail")}</li>
          {full && <li className="font-semibold">{t("admin.orders.fulfilment.refundNoteFull")}</li>}
        </ul>

        {refusal && (
          <p role="alert" className="m-0 text-[length:var(--text-body-sm)] font-medium text-[var(--status-error-fg)]">
            {t(`admin.orders.fulfilment.error.${refusal}`)}
          </p>
        )}
      </div>
    </Dialog>
  );
}
