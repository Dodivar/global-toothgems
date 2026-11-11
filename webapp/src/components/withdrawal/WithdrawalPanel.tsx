"use client";

import { useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, RotateCcw, Undo2 } from "lucide-react";
import { Button } from "../ui/Button";
import { Badge, type BadgeTone } from "../ui/Badge";
import { Checkbox } from "../ui/Checkbox";
import { Input } from "../ui/Input";
import type { Declaration, DeclareAnswer } from "../../lib/orderWithdrawal";
import {
  choiceProblem,
  type ChoiceProblem,
  type DeclaredWithdrawal,
  type DeclareError,
  type LineChoice,
  type WithdrawalOptions,
} from "../../lib/orderWithdrawalMapping";
import { dateLabel, dateTimeLabel } from "../../lib/withdrawalDates";

/**
 * The shop's online withdrawal function (L221-21, decision 131), shared by the
 * member's order page and the guest page: the clearly labelled entry ("Se
 * rétracter du contrat ici"), the declaration (name, lines and quantities, the
 * seal of products for the mouth, the consumer status), then the second action
 * ("Confirmer la rétractation"). The database decides; this only collects and
 * explains. The withdrawals already declared are listed with their state.
 */

type Step = "idle" | "form" | "confirm" | "done";

const STATUS_TONE: Record<DeclaredWithdrawal["status"], BadgeTone> = {
  declared: "brand",
  return_received: "brand",
  refunded: "success",
  refused: "error",
};

interface Props {
  options: WithdrawalOptions;
  onDeclare: (declaration: Declaration) => Promise<DeclareAnswer>;
  /** Called after a declaration was recorded (the page reloads its data). */
  onDeclared?: () => void;
  defaultName?: string;
  /** Where the panel sits: a card on the order page, the main content of the guest page. */
  headingLevel?: "h2" | "h3";
}

export function WithdrawalPanel({ options, onDeclare, onDeclared, defaultName = "", headingLevel = "h2" }: Props) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith("en") ? "en" : "fr";
  const Heading = headingLevel;
  const formId = useId();
  const [step, setStep] = useState<Step>("idle");
  const [name, setName] = useState(defaultName);
  const [asConsumer, setAsConsumer] = useState(false);
  const [choices, setChoices] = useState<Record<string, LineChoice>>({});
  const [problem, setProblem] = useState<ChoiceProblem | "name" | "consumer" | null>(null);
  const [error, setError] = useState<DeclareError | null>(null);
  const [busy, setBusy] = useState(false);
  const [declaredAt, setDeclaredAt] = useState<string | null>(null);

  const withdrawable = useMemo(() => options.lines.filter((l) => l.withdrawable > 0), [options.lines]);
  const chosen = withdrawable.filter((l) => (choices[l.orderItemId]?.quantity ?? 0) > 0);

  const setChoice = (id: string, patch: Partial<LineChoice>) =>
    setChoices((current) => ({ ...current, [id]: { ...(current[id] ?? { quantity: 0, sealOpened: null }), ...patch } }));

  const start = () => {
    // Every unit preselected: a full withdrawal is the common case; the customer lowers what they keep.
    setChoices(Object.fromEntries(withdrawable.map((l) => [l.orderItemId, { quantity: l.withdrawable, sealOpened: null }])));
    setProblem(null);
    setError(null);
    setStep("form");
  };

  const review = () => {
    if (!name.trim()) return setProblem("name");
    const found = choiceProblem(options.lines, choices);
    if (found) return setProblem(found);
    if (!asConsumer) return setProblem("consumer");
    setProblem(null);
    setStep("confirm");
  };

  const confirm = async () => {
    setBusy(true);
    setError(null);
    const answer = await onDeclare({ customerName: name, lines: options.lines, choices, asConsumer, locale: lang });
    setBusy(false);
    if (answer.kind === "error") {
      setError(answer.error);
      return;
    }
    setDeclaredAt(answer.declaredAt);
    setStep("done");
    onDeclared?.();
  };

  return (
    <section
      aria-labelledby={`${formId}-title`}
      className="gt-no-print grid gap-4 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-[var(--space-5)] shadow-[var(--shadow-xs)]"
    >
      <Heading id={`${formId}-title`} className="flex items-center gap-2 text-[length:var(--text-h4)]">
        <Undo2 size={16} aria-hidden="true" />
        {t("withdrawal.title")}
      </Heading>

      {options.withdrawals.length > 0 && <DeclaredList withdrawals={options.withdrawals} lang={lang} />}

      {step === "done" && declaredAt ? (
        <div role="status" className="grid gap-2 rounded-[var(--radius-control)] bg-[var(--status-success-bg)] p-4 text-[var(--status-success-fg)]">
          <p className="m-0 flex items-center gap-2 font-semibold">
            <CheckCircle2 size={16} aria-hidden="true" />
            {t("withdrawal.done.title")}
          </p>
          <p className="m-0 text-[length:var(--text-body-sm)]">
            {t("withdrawal.done.body", { date: dateTimeLabel(declaredAt, lang) })}
          </p>
        </div>
      ) : !options.open ? (
        <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
          {t(`withdrawal.closed.${options.reason ?? "nothing_left"}`)}
        </p>
      ) : (
        <>
          <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-body)]">
            {options.deadlineAt
              ? t("withdrawal.openUntil", { date: dateLabel(options.deadlineAt, lang) })
              : t("withdrawal.openNotStarted")}
          </p>

          {step === "idle" && (
            <div>
              <Button variant="outline" iconLeft={RotateCcw} onClick={start}>
                {t("withdrawal.cta")}
              </Button>
            </div>
          )}

          {step === "form" && (
            <form
              className="grid gap-5"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                review();
              }}
            >
              <fieldset className="m-0 grid gap-3 border-0 p-0">
                <legend className="mb-2 text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">
                  {t("withdrawal.form.itemsLegend")}
                </legend>
                <ul className="m-0 grid list-none gap-3 p-0">
                  {options.lines.map((line) => {
                    const choice = choices[line.orderItemId] ?? { quantity: 0, sealOpened: null };
                    const label = line.variantName ? `${line.productName} (${line.variantName})` : line.productName;
                    if (line.withdrawable === 0) {
                      return (
                        <li key={line.orderItemId} className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
                          {label} — {line.excluded ? t(`withdrawal.excluded.${line.excluded}`) : t("withdrawal.excluded.taken")}
                        </li>
                      );
                    }
                    return (
                      <li key={line.orderItemId} className="grid gap-2 rounded-[var(--radius-control)] border border-[var(--border-subtle)] p-3">
                        <label className="flex flex-wrap items-center justify-between gap-3">
                          <span className="text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">{label}</span>
                          <span className="flex items-center gap-2 text-[length:var(--text-caption)] text-[var(--text-muted)]">
                            {t("withdrawal.form.quantity")}
                            <select
                              className="h-10 rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-card)] px-3 text-sm text-[var(--text-primary)]"
                              value={choice.quantity}
                              onChange={(e) => setChoice(line.orderItemId, { quantity: Number(e.target.value) })}
                            >
                              {Array.from({ length: line.withdrawable + 1 }, (_, n) => (
                                <option key={n} value={n}>
                                  {n === 0 ? t("withdrawal.form.keep") : t("withdrawal.form.ofTotal", { count: n, total: line.withdrawable })}
                                </option>
                              ))}
                            </select>
                          </span>
                        </label>
                        {line.hygieneSeal && choice.quantity > 0 && (
                          <fieldset className="m-0 grid gap-1 border-0 p-0">
                            <legend className="text-[length:var(--text-caption)] text-[var(--text-body)]">{t("withdrawal.form.sealQuestion")}</legend>
                            <div className="flex flex-wrap gap-4 text-[length:var(--text-body-sm)]">
                              {([false, true] as const).map((opened) => (
                                <label key={String(opened)} className="flex items-center gap-2">
                                  <input
                                    type="radio"
                                    name={`seal-${line.orderItemId}`}
                                    checked={choice.sealOpened === opened}
                                    onChange={() => setChoice(line.orderItemId, { sealOpened: opened })}
                                  />
                                  {opened ? t("withdrawal.form.sealOpened") : t("withdrawal.form.sealIntact")}
                                </label>
                              ))}
                            </div>
                            {choice.sealOpened === true && (
                              <p className="m-0 text-[length:var(--text-caption)] text-[var(--status-error-fg)]">{t("withdrawal.form.sealOpenedHelp")}</p>
                            )}
                          </fieldset>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </fieldset>

              <Input
                label={t("withdrawal.form.name")}
                id={`${formId}-name`}
                autoComplete="name"
                maxLength={200}
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-invalid={problem === "name" || undefined}
              />

              <Checkbox
                label={t("withdrawal.form.consumer")}
                description={t("withdrawal.form.consumerHelp")}
                checked={asConsumer}
                onChange={setAsConsumer}
                invalid={problem === "consumer"}
              />

              {problem && (
                <p role="alert" className="m-0 text-[length:var(--text-body-sm)] text-[var(--status-error-fg)]">
                  {t(`withdrawal.problem.${problem}`)}
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                <Button type="submit">{t("withdrawal.form.continue")}</Button>
                <Button type="button" variant="ghost" onClick={() => setStep("idle")}>
                  {t("withdrawal.form.cancel")}
                </Button>
              </div>
            </form>
          )}

          {step === "confirm" && (
            <div className="grid gap-4">
              <p className="m-0 text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">{t("withdrawal.confirm.title")}</p>
              <dl className="m-0 grid gap-1 text-[length:var(--text-body-sm)]">
                <dt className="font-semibold">{t("withdrawal.confirm.order")}</dt>
                <dd className="m-0">{options.orderNumber}</dd>
                <dt className="font-semibold">{t("withdrawal.form.name")}</dt>
                <dd className="m-0">{name.trim()}</dd>
                <dt className="font-semibold">{t("withdrawal.confirm.items")}</dt>
                <dd className="m-0">
                  <ul className="m-0 list-disc pl-5">
                    {chosen.map((line) => (
                      <li key={line.orderItemId}>
                        {line.variantName ? `${line.productName} (${line.variantName})` : line.productName} × {choices[line.orderItemId].quantity}
                      </li>
                    ))}
                  </ul>
                </dd>
              </dl>
              <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("withdrawal.confirm.notice")}</p>
              {error && (
                <p role="alert" className="m-0 text-[length:var(--text-body-sm)] text-[var(--status-error-fg)]">
                  {t(`withdrawal.error.${error}`, { defaultValue: t("withdrawal.error.unavailable") })}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void confirm()} loading={busy} disabled={busy}>
                  {t("withdrawal.confirm.action")}
                </Button>
                <Button variant="ghost" onClick={() => setStep("form")} disabled={busy}>
                  {t("withdrawal.confirm.edit")}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function DeclaredList({ withdrawals, lang }: { withdrawals: DeclaredWithdrawal[]; lang: string }) {
  const { t } = useTranslation();
  return (
    <ul className="m-0 grid list-none gap-3 p-0">
      {withdrawals.map((w) => (
        <li key={w.id} className="grid gap-1 rounded-[var(--radius-control)] border border-[var(--border-subtle)] p-3">
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={STATUS_TONE[w.status]}>{t(`withdrawal.status.${w.status}`)}</Badge>
            {w.status !== "refunded" && w.refundStatus === "pending" && <Badge tone="neutral">{t("withdrawal.status.refundPending")}</Badge>}
            <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
              {t("withdrawal.declaredOn", { date: dateTimeLabel(w.declaredAt, lang) })}
            </span>
          </span>
          <span className="text-[length:var(--text-caption)] text-[var(--text-body)]">
            {w.items.map((i) => `${i.productName}${i.variantName ? ` (${i.variantName})` : ""} × ${i.quantity}`).join(", ")}
          </span>
          {w.status === "declared" && (
            <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("withdrawal.nextStep")}</span>
          )}
          {w.status === "refused" && w.refusalReason && (
            <span className="text-[length:var(--text-caption)] text-[var(--status-error-fg)]">
              {t(`withdrawal.refusal.${w.refusalReason}`)}
              {w.refusalNote ? ` — ${w.refusalNote}` : ""}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
