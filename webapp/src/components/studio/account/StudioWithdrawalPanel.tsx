"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CircleAlert, CircleCheck, Undo2 } from "lucide-react";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { Link } from "../../../lib/navigation";
import { useFormat } from "../../../lib/format";
import { fetchWithdrawalQuote, withdrawFromStudio } from "../../../lib/studioWithdrawal";
import type { WithdrawAnswer, WithdrawalFigures, WithdrawalQuote } from "../../../lib/studioWithdrawalMapping";

/**
 * The right of withdrawal on `/compte/studio` (decision 95). Shown only while
 * it applies: within 14 days of the first payment, the deadline and what would
 * come back now (the database's figures: the share of the period used is kept,
 * the rest refunded); then, once used, where the refund stands. Withdrawing
 * stops the subscription at once; the creations stay in the account.
 *
 * `onWithdrawn` lets the page re-read the access (the webhook closes it).
 */
export function StudioWithdrawalPanel({ onWithdrawn }: { onWithdrawn: () => void }) {
  const { t } = useTranslation();
  const { formatDate } = useFormat();
  const [quote, setQuote] = useState<WithdrawalQuote | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [answer, setAnswer] = useState<WithdrawAnswer | null>(null);
  const k = "studio.account.withdrawal";

  const load = useCallback(() => {
    fetchWithdrawalQuote()
      .then(setQuote)
      .catch(() => setQuote({ kind: "none" }));
  }, []);

  useEffect(load, [load]);

  const withdraw = async () => {
    setSending(true);
    const result = await withdrawFromStudio();
    setSending(false);
    setConfirming(false);
    setAnswer(result);
    load();
    if (result.kind === "done") onWithdrawn();
  };

  if (!quote || quote.kind === "none") return null;
  // The deadline is the first instant after the 14th day: the member sees that last day.
  const lastDay = (deadline: string) => formatDate(new Date(Date.parse(deadline) - 1).toISOString());

  if (quote.kind === "contact") {
    return (
      <Box>
        <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-body)]">
          {t(`${k}.contact`, { date: lastDay(quote.deadline) })}{" "}
          <Link to="/contact" className="font-semibold underline underline-offset-2">
            {t(`${k}.contactLink`)}
          </Link>
        </p>
      </Box>
    );
  }

  if (quote.kind === "withdrawn") {
    return (
      <Box>
        <WithdrawnStatus quote={quote} />
        {quote.status === "requested" && (
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" size="sm" loading={sending} disabled={sending} onClick={() => void withdraw()}>
              {t(`${k}.retry`)}
            </Button>
          </div>
        )}
        <AnswerNote answer={answer} />
      </Box>
    );
  }

  return (
    <Box>
      <div className="grid gap-1.5">
        <h3 className="inline-flex items-center gap-2 text-[length:var(--text-body-md)] font-semibold text-[var(--text-primary)]">
          <Undo2 size={16} aria-hidden="true" />
          {t(`${k}.title`)}
        </h3>
        <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-body)]">{t(`${k}.until`, { date: lastDay(quote.deadline) })}</p>
      </div>
      <Figures figures={quote.figures} />
      <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t(`${k}.estimateNote`)}</p>
      <div>
        <Button variant="dangerOutline" onClick={() => setConfirming(true)}>
          {t(`${k}.cta`)}
        </Button>
      </div>
      <AnswerNote answer={answer} />

      <Dialog
        open={confirming}
        onClose={() => !sending && setConfirming(false)}
        tone="danger"
        title={t(`${k}.confirmTitle`)}
        description={t(`${k}.confirmBody`)}
        closeLabel={t(`${k}.cancel`)}
        footer={
          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="ghost" disabled={sending} onClick={() => setConfirming(false)}>
              {t(`${k}.cancel`)}
            </Button>
            <Button variant="danger" loading={sending} disabled={sending} onClick={() => void withdraw()}>
              {t(`${k}.confirm`)}
            </Button>
          </div>
        }
      >
        <div className="grid gap-3">
          <Figures figures={quote.figures} />
          <ul className="m-0 grid gap-1.5 pl-5 text-[length:var(--text-body-sm)] text-[var(--text-body)]">
            <li>{t(`${k}.effectAccess`)}</li>
            <li>{t(`${k}.effectRefund`)}</li>
            <li>{t(`${k}.effectCreations`)}</li>
          </ul>
        </div>
      </Dialog>
    </Box>
  );
}

function Box({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-4 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-[var(--space-5)] shadow-[var(--shadow-xs)]">
      {children}
    </div>
  );
}

function Figures({ figures }: { figures: Pick<WithdrawalFigures, "usedDays" | "periodDays" | "used" | "refund" | "currency"> & { paid?: number } }) {
  const { t } = useTranslation();
  const { formatMoney } = useFormat();
  const k = "studio.account.withdrawal";
  const rows: [string, string][] = [];
  if (figures.paid !== undefined) rows.push([t(`${k}.paid`), formatMoney(figures.paid, figures.currency)]);
  rows.push([t(`${k}.used`, { days: figures.usedDays, total: figures.periodDays }), `− ${formatMoney(figures.used, figures.currency)}`]);
  rows.push([t(`${k}.refund`), formatMoney(figures.refund, figures.currency)]);
  return (
    <dl className="m-0 grid gap-1.5 rounded-[var(--radius-md)] bg-[var(--surface-sunken)] px-4 py-3 text-[length:var(--text-body-sm)] tabular-nums">
      {rows.map(([label, value], i) => (
        <div key={label} className={i === rows.length - 1 ? "flex justify-between gap-3 border-t border-[var(--border-subtle)] pt-1.5 font-semibold" : "flex justify-between gap-3"}>
          <dt className="m-0">{label}</dt>
          <dd className="m-0">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function WithdrawnStatus({ quote }: { quote: Extract<WithdrawalQuote, { kind: "withdrawn" }> }) {
  const { t } = useTranslation();
  const { formatDate, formatMoney } = useFormat();
  const k = "studio.account.withdrawal";
  const failed = quote.status === "refund_failed";
  return (
    <p className="m-0 inline-flex items-start gap-2 text-[length:var(--text-body-sm)] text-[var(--text-body)]">
      {failed ? (
        <CircleAlert size={16} aria-hidden="true" className="mt-0.5 flex-none text-[var(--status-error-fg)]" />
      ) : (
        <CircleCheck size={16} aria-hidden="true" className="mt-0.5 flex-none text-[var(--status-success-fg)]" />
      )}
      <span>
        {t(`${k}.status.${quote.status}`, {
          date: formatDate(quote.requestedAt),
          amount: formatMoney(quote.refund, quote.currency),
        })}
      </span>
    </p>
  );
}

function AnswerNote({ answer }: { answer: WithdrawAnswer | null }) {
  const { t } = useTranslation();
  const k = "studio.account.withdrawal";
  if (!answer || answer.kind === "done") return null;
  const message =
    answer.kind === "refused" ? t(`${k}.refused.${answer.reason}`) : answer.kind === "incomplete" ? t(`${k}.incomplete`) : t(`${k}.error`);
  return (
    <p role="alert" className="m-0 text-[length:var(--text-body-sm)] font-medium text-[var(--status-error-fg)]">
      {message}
    </p>
  );
}
