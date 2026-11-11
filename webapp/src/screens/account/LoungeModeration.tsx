"use client";

import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { CircleCheck, EyeOff, Flag, Gavel, PlugZap, Scale, ShieldAlert } from "lucide-react";
import clsx from "clsx";
import { SectionHeader } from "../../components/account/SectionHeader";
import { Badge, type BadgeTone } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { useFormat } from "../../lib/format";
import { useSearchParams } from "../../lib/navigation";
import {
  TEXT_MAX,
  TEXT_MIN,
  activeMute,
  canAppeal,
  isTextValid,
  type ModerationDecision,
  type MyReport,
} from "../../lib/communityChat/moderation";
import { useMyModeration } from "../../lib/communityChat/useMyModeration";

const panel = "grid gap-4 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-[clamp(16px,3vw,24px)]";
const sectionTitle = "m-0 text-[length:var(--text-h4,18px)] font-[var(--weight-black)] text-[var(--text-primary)]";

/** A date and time in the interface's language (Paris time is the browser's for French members). */
function dateTime(value: string | number, language: string): string {
  return new Intl.DateTimeFormat(language === "en" ? "en-GB" : "fr-FR", { dateStyle: "long", timeStyle: "short" }).format(new Date(value));
}

const APPEAL_TONE: Record<string, BadgeTone> = { open: "warning", upheld: "neutral", reversed: "success" };
const REPORT_TONE: Record<string, BadgeTone> = { open: "warning", actioned: "success", dismissed: "neutral" };

/**
 * `/compte/moderation` (decision 132): what the Members' Lounge moderation
 * decided about the member — statements of reasons (DSA art. 17) and the
 * complaint form (art. 20, 6 months) —, their reports and what became of
 * them, the members whose messages they hid. The e-mails link here
 * (`?decision=<id>` opens that decision's complaint form).
 */
export function LoungeModeration() {
  const { t, i18n } = useTranslation();
  const { formatDate } = useFormat();
  const [params] = useSearchParams();
  const focus = params.get("decision");
  const { file, state, reload, appeal, unblock } = useMyModeration();
  const now = Date.now();
  const mutedUntil = activeMute(file, now);

  return (
    <section className="grid gap-[var(--space-5)]">
      <SectionHeader icon={Scale} eyebrow={t("moderation.member.eyebrow")} title={t("moderation.member.title")} description={t("moderation.member.description")} />

      {state === "unavailable" ? (
        <div className={panel}>
          <p className="m-0 flex items-center gap-2 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
            <PlugZap size={18} aria-hidden="true" />
            {t("moderation.member.unavailable")}
          </p>
        </div>
      ) : state === "loading" ? (
        <div role="status" className="grid gap-3">
          <span className="sr-only">{t("moderation.member.loading")}</span>
          {[0, 1].map((i) => (
            <div key={i} className="gt-skeleton h-28 rounded-[var(--radius-lg)]" />
          ))}
        </div>
      ) : state === "error" ? (
        <div className={panel}>
          <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-body)]">{t("moderation.member.error")}</p>
          <div>
            <Button variant="outline" size="sm" onClick={reload}>{t("moderation.member.retry")}</Button>
          </div>
        </div>
      ) : (
        <>
          {(file.bannedAt || mutedUntil !== null) && (
            <div role="status" className="flex items-start gap-3 rounded-[var(--radius-lg)] border border-[var(--gt-amber-400)] bg-[var(--status-warning-bg)] p-4 text-[var(--status-warning-fg)]">
              <ShieldAlert size={20} aria-hidden="true" className="mt-0.5 flex-none" />
              <p className="m-0 text-[length:var(--text-body-sm)] font-semibold">
                {file.bannedAt
                  ? t("moderation.member.bannedNow", { date: formatDate(file.bannedAt) })
                  : t("moderation.member.mutedNow", { date: dateTime(mutedUntil!, i18n.language) })}
              </p>
            </div>
          )}

          <section className={panel} aria-labelledby="moderation-decisions">
            <h2 id="moderation-decisions" className={sectionTitle}>{t("moderation.member.decisionsTitle")}</h2>
            {file.decisions.length === 0 ? (
              <p className="m-0 flex items-center gap-2 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
                <CircleCheck size={16} aria-hidden="true" />
                {t("moderation.member.noDecision")}
              </p>
            ) : (
              <ul className="m-0 grid list-none gap-3 p-0">
                {file.decisions.map((decision) => (
                  <li key={decision.id}>
                    <DecisionCard decision={decision} now={now} openForm={decision.id === focus} onAppeal={appeal} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={panel} aria-labelledby="moderation-reports">
            <h2 id="moderation-reports" className={sectionTitle}>{t("moderation.member.reportsTitle")}</h2>
            {file.reports.length === 0 ? (
              <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">{t("moderation.member.noReport")}</p>
            ) : (
              <ul className="m-0 grid list-none gap-3 p-0">
                {file.reports.map((report) => (
                  <li key={report.id}>
                    <ReportCard report={report} now={now} openForm={report.decision?.id === focus} onAppeal={appeal} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={panel} aria-labelledby="moderation-blocked">
            <h2 id="moderation-blocked" className={sectionTitle}>{t("moderation.member.blockedTitle")}</h2>
            <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">{t("moderation.member.blockedHint")}</p>
            {file.blocked.length === 0 ? (
              <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">{t("moderation.member.noBlocked")}</p>
            ) : (
              <ul className="m-0 grid list-none gap-2 p-0">
                {file.blocked.map((member) => (
                  <BlockedRow key={member.id} name={member.name ?? t("lounge.memberUnnamed")} handle={member.handle} onUnblock={() => unblock(member.id)} />
                ))}
              </ul>
            )}
          </section>

          <p className="m-0 text-[length:var(--text-caption)] leading-relaxed text-[var(--text-muted)]">{t("moderation.member.footer")}</p>
        </>
      )}
    </section>
  );
}

function useDecisionLabels() {
  const { t } = useTranslation();
  return {
    action: (decision: ModerationDecision) => t(`moderation.actions.${decision.action}`),
    reason: (decision: Pick<ModerationDecision, "reason" | "category">) =>
      decision.reason
        ? decision.category
          ? `${t(`lounge.moderation.reasons.${decision.reason}`)} (${t(`lounge.moderation.categories.${decision.category}`)})`
          : t(`lounge.moderation.reasons.${decision.reason}`)
        : null,
  };
}

function DecisionCard({
  decision,
  now,
  openForm,
  onAppeal,
  asReporter = false,
}: {
  decision: ModerationDecision;
  now: number;
  openForm: boolean;
  onAppeal: (decisionId: string, body: string) => Promise<null | "duplicate" | "invalid" | "failed">;
  asReporter?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const { formatDate } = useFormat();
  const labels = useDecisionLabels();
  const reason = labels.reason(decision);
  return (
    <article id={`decision-${decision.id}`} className={clsx("grid gap-3 rounded-[var(--radius-md)] border p-4", openForm ? "border-[var(--gt-blue-400,var(--border-strong))]" : "border-[var(--border-subtle)]")}>
      <div className="flex flex-wrap items-center gap-2">
        <Gavel size={16} aria-hidden="true" />
        <span className="text-[length:var(--text-body-sm)] font-bold text-[var(--text-primary)]">{labels.action(decision)}</span>
        <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">{formatDate(decision.createdAt)}</span>
      </div>
      <dl className="m-0 grid gap-x-4 gap-y-1.5 text-[length:var(--text-body-sm)] sm:grid-cols-[minmax(140px,max-content)_1fr]">
        {(decision.excerpt || decision.attachmentCount > 0) && (
          <>
            <dt className="font-semibold text-[var(--text-muted)]">{t("moderation.member.content")}</dt>
            <dd className="m-0 whitespace-pre-line text-[var(--text-body)]">
              {[decision.excerpt ? `« ${decision.excerpt} »` : null, decision.attachmentCount ? t("moderation.member.images", { count: decision.attachmentCount }) : null]
                .filter(Boolean)
                .join(" + ")}
            </dd>
          </>
        )}
        {decision.endsAt && (
          <>
            <dt className="font-semibold text-[var(--text-muted)]">{t("moderation.member.until")}</dt>
            <dd className="m-0">{dateTime(decision.endsAt, i18n.language)}</dd>
          </>
        )}
        {reason && (
          <>
            <dt className="font-semibold text-[var(--text-muted)]">{t("moderation.member.reason")}</dt>
            <dd className="m-0">{reason}</dd>
          </>
        )}
        {decision.ground && (
          <>
            <dt className="font-semibold text-[var(--text-muted)]">{t("moderation.member.ground")}</dt>
            <dd className="m-0">{t(`moderation.grounds.${decision.ground}`)}</dd>
          </>
        )}
        <dt className="font-semibold text-[var(--text-muted)]">{t("moderation.member.automated")}</dt>
        <dd className="m-0">{t("moderation.member.automatedNo")}</dd>
        <dt className="font-semibold text-[var(--text-muted)]">{t("moderation.member.statement")}</dt>
        <dd className="m-0 whitespace-pre-line">{decision.statement}</dd>
      </dl>
      <AppealBlock decision={decision} now={now} openForm={openForm} onAppeal={onAppeal} asReporter={asReporter} />
    </article>
  );
}

function AppealBlock({
  decision,
  now,
  openForm,
  onAppeal,
  asReporter,
}: {
  decision: ModerationDecision;
  now: number;
  openForm: boolean;
  onAppeal: (decisionId: string, body: string) => Promise<null | "duplicate" | "invalid" | "failed">;
  asReporter: boolean;
}) {
  const { t } = useTranslation();
  const { formatDate } = useFormat();
  const fieldId = useId();
  const [open, setOpen] = useState(openForm);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (decision.appeal) {
    const a = decision.appeal;
    return (
      <div className="grid gap-2 rounded-[var(--radius-md)] bg-[var(--surface-sunken)] p-3 text-[length:var(--text-body-sm)]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold text-[var(--text-primary)]">{t("moderation.member.appealTitle")}</span>
          <Badge size="sm" tone={APPEAL_TONE[a.status] ?? "neutral"}>{t(`moderation.appealStatus.${a.status}`)}</Badge>
          <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">{formatDate(a.createdAt)}</span>
        </div>
        {a.body && <p className="m-0 whitespace-pre-line text-[var(--text-body)]">{a.body}</p>}
        {a.response ? (
          <p className="m-0 whitespace-pre-line">
            <span className="font-semibold">{t("moderation.member.response")} </span>
            {a.response}
          </p>
        ) : (
          <p className="m-0 text-[var(--text-muted)]">{t("moderation.member.appealPending")}</p>
        )}
      </div>
    );
  }
  if (!canAppeal(decision, now)) {
    return <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("moderation.member.appealClosed")}</p>;
  }
  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>{t("moderation.member.appealOpen")}</Button>
        <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("moderation.member.appealUntil", { date: formatDate(decision.appealUntil) })}</span>
      </div>
    );
  }
  return (
    <form
      noValidate
      className="grid gap-2"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!isTextValid(body)) {
          setError(t("moderation.member.appealTooShort", { min: TEXT_MIN }));
          return;
        }
        setBusy(true);
        setError(null);
        const refused = await onAppeal(decision.id, body);
        setBusy(false);
        if (refused) setError(t(`moderation.member.appealErrors.${refused}`));
      }}
    >
      <label htmlFor={fieldId} className="text-[length:var(--text-body-sm)] font-bold text-[var(--text-primary)]">
        {t(asReporter ? "moderation.member.appealLabelReporter" : "moderation.member.appealLabel")}
      </label>
      <textarea
        id={fieldId}
        rows={4}
        maxLength={TEXT_MAX}
        value={body}
        autoFocus={openForm}
        onChange={(event) => setBody(event.target.value)}
        className="gt-field w-full resize-y rounded-[var(--radius-md)] border border-[var(--border-default)] px-3 py-2 text-[length:var(--text-body-sm)]"
      />
      <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("moderation.member.appealHint", { date: formatDate(decision.appealUntil) })}</p>
      <div aria-live="polite" className="empty:hidden">
        {error && <p className="m-0 text-[length:var(--text-caption)] font-semibold text-[var(--status-error-fg)]">{error}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="dark" size="sm" type="submit" disabled={busy}>{busy ? t("moderation.member.appealSending") : t("moderation.member.appealSubmit")}</Button>
        <Button variant="ghost" size="sm" type="button" onClick={() => setOpen(false)} disabled={busy}>{t("common.cancel")}</Button>
      </div>
    </form>
  );
}

function ReportCard({
  report,
  now,
  openForm,
  onAppeal,
}: {
  report: MyReport;
  now: number;
  openForm: boolean;
  onAppeal: (decisionId: string, body: string) => Promise<null | "duplicate" | "invalid" | "failed">;
}) {
  const { t } = useTranslation();
  const { formatDate } = useFormat();
  const labels = useDecisionLabels();
  return (
    <article className="grid gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Flag size={15} aria-hidden="true" />
        <span className="text-[length:var(--text-body-sm)] font-bold text-[var(--text-primary)]">{labels.reason(report)}</span>
        <Badge size="sm" tone={REPORT_TONE[report.status] ?? "neutral"}>{t(`moderation.reportStatus.${report.status}`)}</Badge>
        <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("moderation.member.reportedOn", { date: formatDate(report.createdAt) })}</span>
      </div>
      {report.decision && (
        <div className="grid gap-2 text-[length:var(--text-body-sm)]">
          <p className="m-0">
            <span className="font-semibold">{t("moderation.member.outcome")} </span>
            {labels.action(report.decision)}
            {report.decision.action === "dismiss" && ` — ${report.decision.statement}`}
          </p>
          <AppealBlock decision={report.decision} now={now} openForm={openForm} onAppeal={onAppeal} asReporter />
        </div>
      )}
    </article>
  );
}

function BlockedRow({ name, handle, onUnblock }: { name: string; handle: string | null; onUnblock: () => Promise<boolean> }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-3 py-2">
      <EyeOff size={15} aria-hidden="true" />
      <span className="text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">{name}</span>
      {handle && <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">@{handle}</span>}
      <span className="ml-auto flex items-center gap-2">
        {failed && <span className="text-[length:var(--text-caption)] text-[var(--status-error-fg)]">{t("moderation.member.unblockFailed")}</span>}
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setFailed(!(await onUnblock()));
            setBusy(false);
          }}
        >
          {t("lounge.profile.unblock")}
        </Button>
      </span>
    </li>
  );
}
