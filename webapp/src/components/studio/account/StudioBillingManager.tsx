"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CircleAlert, CircleCheck, CreditCard, Download, FileText, Layers, RotateCw } from "lucide-react";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { Select } from "../../ui/Select";
import { StudioPaidPlans } from "../StudioPlans";
import { StudioPlanComparison } from "./StudioPlanComparison";
import { StudioCardDialog } from "./StudioCardDialog";
import { useFormat } from "../../../lib/format";
import { useAuth } from "../../../lib/auth";
import { invoiceDocument, invoiceFileName } from "../../../lib/documents/invoiceDocument";
import type { OrderInvoice } from "../../../lib/documents/invoiceModel";
import { useDocumentDownload } from "../../../lib/documents/useDocumentDownload";
import { useDocumentFormat } from "../../../lib/documents/useDocumentFormat";
import { creditedInvoice, fetchMyStudioDocuments } from "../../../lib/studioInvoices";
import {
  cancelStudioSubscription,
  changeStudioPlan,
  confirmStudioCharge,
  fetchStudioManageOverview,
  previewStudioChange,
  resumeStudioSubscription,
  saveStudioCard,
} from "../../../lib/studioBilling";
import {
  STUDIO_CANCEL_REASONS,
  type StudioCancelReason,
  type StudioChangePreview,
  type StudioManageOverview,
} from "../../../lib/studioManageMapping";
import type { StudioBillingInterval, StudioPaidPlanId } from "../../../data/studio";

/**
 * The 3D Studio subscription managed on our own page (decision 112), in place
 * of the Stripe customer portal and with its rules: switch plan or billing
 * (prorated; a billing switch is charged at once), compare the plans, replace
 * the card, download the invoices and credit notes, cancel at the end of the
 * period or keep the subscription. The subscription is read from and changed at
 * Stripe by `studio-manage-subscription`; the Studio's access follows through
 * the verified webhook, so `onChanged` asks the page to re-read it. The
 * invoices are our own legal documents (decision 115), read from the database
 * and drawn as PDFs in the browser — never Stripe's.
 */
/** The verified webhook usually mirrors a change within seconds. */
const WEBHOOK_REREADS_MS = [3_000, 10_000];

export function StudioBillingManager({ onChanged }: { onChanged: () => void }) {
  const { t } = useTranslation();
  const k = "studio.account";
  const [overview, setOverview] = useState<StudioManageOverview | null>(null);
  const [failed, setFailed] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [cardOpen, setCardOpen] = useState(false);

  const load = useCallback(async () => {
    const answer = await fetchStudioManageOverview();
    if (answer.kind === "ok") {
      setOverview(answer.value);
      setFailed(false);
    } else {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // A bank that redirected during the card step brings the member back with the session to save.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    if (params.get("card") !== "saved" || !sessionId) return;
    window.history.replaceState(null, "", window.location.pathname);
    void saveStudioCard(sessionId).then((answer) => {
      setNotice(
        answer.kind === "error"
          ? { tone: "error", text: t(`${k}.card.error`) }
          : { tone: "success", text: t(`${k}.card.saved`) },
      );
      void load();
      onChanged();
    });
  }, [load, onChanged, t]);

  const changed = (tone: "success" | "error", text: string) => {
    setNotice({ tone, text });
    void load();
    onChanged();
    // The access above is the webhook's mirror: read it again once Stripe's event has landed.
    for (const delay of WEBHOOK_REREADS_MS) window.setTimeout(onChanged, delay);
  };

  if (failed && !overview) {
    return (
      <Panel>
        <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-body)]">{t(`${k}.manageError`)}</p>
        <div>
          <Button variant="outline" size="sm" iconLeft={RotateCw} onClick={() => void load()}>
            {t(`${k}.retry`)}
          </Button>
        </div>
      </Panel>
    );
  }
  if (!overview) {
    return (
      <p role="status" aria-busy="true" className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
        {t(`${k}.manageLoading`)}
      </p>
    );
  }

  const sub = overview.subscription;
  const running = sub !== null && ["active", "trialing", "past_due", "unpaid"].includes(sub.status);

  return (
    <div className="grid gap-5">
      {notice && (
        <p
          role={notice.tone === "error" ? "alert" : "status"}
          className={`m-0 flex items-start gap-2 rounded-[var(--radius-md)] px-4 py-3 text-[length:var(--text-body-sm)] font-medium ${
            notice.tone === "error" ? "bg-[var(--status-error-bg)] text-[var(--status-error-fg)]" : "bg-[var(--status-success-bg)] text-[var(--status-success-fg)]"
          }`}
        >
          {notice.tone === "error" ? <CircleAlert size={16} aria-hidden="true" className="mt-0.5 flex-none" /> : <CircleCheck size={16} aria-hidden="true" className="mt-0.5 flex-none" />}
          {notice.text}
        </p>
      )}

      {running && sub && <PlanSection overview={overview} onDone={changed} />}

      {running && (
        <Panel title={t(`${k}.card.title`)} icon={CreditCard}>
          <CardLine overview={overview} />
          <div>
            <Button variant={sub?.status === "past_due" || sub?.status === "unpaid" ? "primary" : "outline"} onClick={() => setCardOpen(true)}>
              {t(overview.card ? `${k}.card.replace` : `${k}.card.add`)}
            </Button>
          </div>
          <StudioCardDialog
            open={cardOpen}
            onClose={() => setCardOpen(false)}
            onSaved={(tone, message) => {
              setCardOpen(false);
              changed(tone, message);
            }}
          />
        </Panel>
      )}

      <Invoices />

      {running && sub && <CancelSection overview={overview} onDone={changed} />}
    </div>
  );
}

function Panel({ title, icon: Icon, children }: { title?: string; icon?: typeof Layers; children: ReactNode }) {
  return (
    <section className="grid gap-4 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-[var(--space-5)] shadow-[var(--shadow-xs)]">
      {title && (
        <h3 className="m-0 inline-flex items-center gap-2 text-[length:var(--text-body-md)] font-semibold text-[var(--text-primary)]">
          {Icon && <Icon size={16} aria-hidden="true" />}
          {title}
        </h3>
      )}
      {children}
    </section>
  );
}

/* ------------------------------------------------------------ Plan switch */

function PlanSection({ overview, onDone }: { overview: StudioManageOverview; onDone: (tone: "success" | "error", text: string) => void }) {
  const { t, i18n } = useTranslation();
  const { formatMoney, formatDate } = useFormat();
  const locale = i18n.language?.startsWith("en") ? "en" : "fr";
  const k = "studio.account.change";
  const sub = overview.subscription!;
  const [target, setTarget] = useState<{ plan: StudioPaidPlanId; interval: StudioBillingInterval } | null>(null);
  const [preview, setPreview] = useState<StudioChangePreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const current = sub.plan && sub.interval ? { plan: sub.plan, interval: sub.interval } : null;
  const lockedReason = sub.status !== "active" && sub.status !== "trialing" ? "pastDue" : sub.cancelAtPeriodEnd ? "canceling" : null;
  const date = (ms: number | null) => (ms === null ? "" : formatDate(new Date(ms).toISOString()));
  const planName = (plan: StudioPaidPlanId) => t(`studio.plans.items.${plan}.name`);

  const choose = async (plan: StudioPaidPlanId, interval: StudioBillingInterval) => {
    setTarget({ plan, interval });
    setPreview(null);
    setPreviewError(null);
    const answer = await previewStudioChange(plan, interval);
    if (answer.kind === "ok") setPreview(answer.value);
    else setPreviewError(t(`${k}.errors.${answer.error}`, { defaultValue: t(`${k}.errors.unavailable`) }));
  };

  const close = () => {
    if (sending) return;
    setTarget(null);
    setPreview(null);
  };

  const confirm = async () => {
    if (!target || !preview) return;
    setSending(true);
    const answer = await changeStudioPlan(target.plan, target.interval, preview.prorationDate);
    const done = t(`${k}.done`, { plan: planName(target.plan), billing: t(`studio.account.interval.${target.interval}`) });
    if (answer.kind === "requires_action") {
      const paid = await confirmStudioCharge(answer.clientSecret, answer.publishableKey, locale);
      onDone(paid ? "success" : "error", paid ? done : t(`${k}.errors.payment_failed`));
    } else if (answer.kind === "error") {
      onDone("error", t(`${k}.errors.${answer.error}`, { defaultValue: t(`${k}.errors.unavailable`) }));
    } else {
      onDone("success", done);
    }
    setSending(false);
    setTarget(null);
    setPreview(null);
  };

  return (
    <section className="grid gap-4">
      <div className="grid gap-1">
        <h3 className="m-0 inline-flex items-center gap-2 text-[length:var(--text-body-md)] font-semibold text-[var(--text-primary)]">
          <Layers size={16} aria-hidden="true" />
          {t(`${k}.title`)}
        </h3>
        {current && sub.amountMinor !== null && (
          <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-body)]">
            {t(`${k}.current`, {
              plan: planName(current.plan),
              price: formatMoney(sub.amountMinor, sub.currency),
              per: t(current.interval === "month" ? "studioPage.plans.perMonth" : "studioPage.plans.perYear"),
            })}
          </p>
        )}
        <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t(`${k}.rules`)}</p>
      </div>
      {lockedReason && (
        <p className="m-0 rounded-[var(--radius-md)] bg-[var(--surface-brand-wash)] px-4 py-3 text-[length:var(--text-body-sm)] text-[var(--text-body)]">
          {t(`${k}.locked.${lockedReason}`)}
        </p>
      )}
      <StudioPaidPlans current={current} locked={lockedReason !== null} onChoose={(plan, interval) => void choose(plan, interval)} />
      <StudioPlanComparison current={current?.plan ?? null} />

      <Dialog
        open={target !== null}
        onClose={close}
        title={target ? t(`${k}.confirmTitle`, { plan: planName(target.plan) }) : ""}
        closeLabel={t(`${k}.keep`)}
        footer={
          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="ghost" disabled={sending} onClick={close}>
              {t(`${k}.keep`)}
            </Button>
            <Button variant="primary" loading={sending} disabled={!preview || sending} onClick={() => void confirm()}>
              {preview?.chargedNow && preview.dueNowMinor > 0
                ? t(`${k}.confirmPay`, { amount: formatMoney(preview.dueNowMinor, preview.currency) })
                : t(`${k}.confirm`)}
            </Button>
          </div>
        }
      >
        {target && (
          <div className="grid gap-3 text-[length:var(--text-body-sm)] text-[var(--text-body)]">
            <p className="m-0">
              {t(`${k}.from`, {
                from: current ? `${planName(current.plan)} · ${t(`studio.account.interval.${current.interval}`)}` : "—",
                to: `${planName(target.plan)} · ${t(`studio.account.interval.${target.interval}`)}`,
              })}
            </p>
            {previewError ? (
              <p role="alert" className="m-0 font-medium text-[var(--status-error-fg)]">
                {previewError}
              </p>
            ) : !preview ? (
              <p role="status" aria-busy="true" className="m-0 text-[var(--text-muted)]">
                {t(`${k}.previewLoading`)}
              </p>
            ) : (
              <dl className="m-0 grid gap-1.5 rounded-[var(--radius-md)] bg-[var(--surface-sunken)] px-4 py-3 tabular-nums">
                {preview.chargedNow && (
                  <Figure label={t(`${k}.dueNow`)} value={formatMoney(preview.dueNowMinor, preview.currency)} strong />
                )}
                <Figure
                  label={t(preview.chargedNow ? `${k}.nextRenewal` : `${k}.nextInvoice`, { date: date(preview.nextDate) })}
                  value={formatMoney(preview.nextAmountMinor, preview.currency)}
                  strong={!preview.chargedNow}
                />
                {preview.creditMinor > 0 && <Figure label={t(`${k}.credit`)} value={formatMoney(preview.creditMinor, preview.currency)} />}
              </dl>
            )}
            {preview && <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t(preview.chargedNow ? `${k}.explainNow` : `${k}.explainLater`)}</p>}
          </div>
        )}
      </Dialog>
    </section>
  );
}

function Figure({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${strong ? "font-semibold text-[var(--text-primary)]" : ""}`}>
      <dt className="m-0">{label}</dt>
      <dd className="m-0">{value}</dd>
    </div>
  );
}

/* ------------------------------------------------------------------- Card */

const BRANDS: Record<string, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "American Express",
  cartes_bancaires: "Carte Bancaire",
  discover: "Discover",
  jcb: "JCB",
  unionpay: "UnionPay",
  diners: "Diners Club",
};

function CardLine({ overview }: { overview: StudioManageOverview }) {
  const { t } = useTranslation();
  const card = overview.card;
  if (!card) return <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">{t("studio.account.card.none")}</p>;
  const brand = card.brand ? BRANDS[card.brand] ?? card.brand : t("studio.account.card.other");
  return (
    <p className="m-0 inline-flex flex-wrap items-center gap-x-3 gap-y-1 text-[length:var(--text-body-md)] text-[var(--text-primary)]">
      <span className="font-semibold">
        {brand}
        {card.last4 && <span className="tabular-nums"> •••• {card.last4}</span>}
      </span>
      {card.expMonth && card.expYear && (
        <span className="text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
          {t("studio.account.card.expires", { date: `${String(card.expMonth).padStart(2, "0")}/${card.expYear}` })}
        </span>
      )}
    </p>
  );
}

/* --------------------------------------------------------------- Invoices */

function Invoices() {
  const { t } = useTranslation();
  const { formatMoney, formatDate } = useFormat();
  const { userId } = useAuth();
  const fmt = useDocumentFormat();
  const { status, download } = useDocumentDownload();
  const [documents, setDocuments] = useState<OrderInvoice[] | null>(null);
  const [failed, setFailed] = useState(false);
  const k = "studio.account.invoices";

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetchMyStudioDocuments(userId).then(
      (rows) => {
        if (!cancelled) setDocuments(rows);
      },
      () => {
        if (!cancelled) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (failed) {
    return (
      <Panel title={t(`${k}.title`)} icon={FileText}>
        <p role="alert" className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-body)]">{t(`${k}.loadError`)}</p>
      </Panel>
    );
  }
  if (!documents || documents.length === 0) return null;

  const save = (doc: OrderInvoice) =>
    void download(async () => ({ document: invoiceDocument(doc, t, fmt, creditedInvoice(documents, doc)), fileName: invoiceFileName(doc, t) }));

  return (
    <Panel title={t(`${k}.title`)} icon={FileText}>
      {status === "error" && (
        <p role="alert" className="m-0 text-[length:var(--text-body-sm)] font-medium text-[var(--status-error-fg)]">{t(`${k}.pdfError`)}</p>
      )}
      <ul className="m-0 grid list-none gap-0 p-0">
        {documents.map((doc) => {
          const kind = t(doc.kind === "creditNote" ? `${k}.creditNote` : `${k}.invoice`);
          return (
            <li key={doc.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-[var(--border-subtle)] py-2.5 last:border-b-0">
              <span className="grid gap-0.5">
                <span className="text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">{formatDate(doc.issuedAt)}</span>
                <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
                  {kind} {doc.number}
                </span>
              </span>
              <span className="flex flex-wrap items-center gap-3">
                <span className="tabular-nums text-[length:var(--text-body-sm)] text-[var(--text-primary)]">
                  {doc.kind === "creditNote" ? "− " : ""}
                  {formatMoney(doc.totalIncl, doc.currency)}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  iconLeft={Download}
                  onClick={() => save(doc)}
                  disabled={status === "working"}
                  aria-label={t(`${k}.downloadLabel`, { kind: kind.toLowerCase(), number: doc.number })}
                >
                  {t(`${k}.download`)}
                </Button>
              </span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

/* --------------------------------------------------------- Cancel / keep */

function CancelSection({ overview, onDone }: { overview: StudioManageOverview; onDone: (tone: "success" | "error", text: string) => void }) {
  const { t } = useTranslation();
  const { formatDate } = useFormat();
  const k = "studio.account.cancel";
  const sub = overview.subscription!;
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<StudioCancelReason | "">("");
  const [sending, setSending] = useState(false);
  const end = sub.periodEnd === null ? "" : formatDate(new Date(sub.periodEnd).toISOString());

  const run = async (action: "cancel" | "resume") => {
    setSending(true);
    const answer = action === "cancel" ? await cancelStudioSubscription(reason || null) : await resumeStudioSubscription();
    setSending(false);
    setOpen(false);
    if (answer.kind === "error") onDone("error", t(`${k}.error`));
    else onDone("success", t(action === "cancel" ? `${k}.done` : `${k}.resumed`, { date: end }));
  };

  if (sub.cancelAtPeriodEnd) {
    return (
      <Panel title={t(`${k}.scheduledTitle`)}>
        <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-body)]">{t(`${k}.scheduled`, { date: end })}</p>
        <div>
          <Button variant="primary" loading={sending} disabled={sending} onClick={() => void run("resume")}>
            {t(`${k}.resume`)}
          </Button>
        </div>
      </Panel>
    );
  }

  return (
    <Panel title={t(`${k}.title`)}>
      <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-body)]">{t(`${k}.body`, { date: end })}</p>
      <div>
        <Button variant="dangerOutline" onClick={() => setOpen(true)}>
          {t(`${k}.cta`)}
        </Button>
      </div>
      <Dialog
        open={open}
        onClose={() => !sending && setOpen(false)}
        tone="danger"
        title={t(`${k}.confirmTitle`)}
        description={t(`${k}.confirmBody`, { date: end })}
        closeLabel={t(`${k}.keep`)}
        footer={
          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="ghost" disabled={sending} onClick={() => setOpen(false)}>
              {t(`${k}.keep`)}
            </Button>
            <Button variant="danger" loading={sending} disabled={sending} onClick={() => void run("cancel")}>
              {t(`${k}.confirm`)}
            </Button>
          </div>
        }
      >
        <Select
          label={t(`${k}.reasonLabel`)}
          value={reason}
          onChange={(value) => setReason(value as StudioCancelReason | "")}
          options={[{ value: "", label: t(`${k}.reasons.none`) }, ...STUDIO_CANCEL_REASONS.map((value) => ({ value, label: t(`${k}.reasons.${value}`) }))]}
        />
      </Dialog>
    </Panel>
  );
}
