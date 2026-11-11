"use client";

import { useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { BarChart3, Check, CircleAlert, EyeOff, Flag, Gavel, History, ListChecks, Lock, MessagesSquare, PlugZap, Scale, ShieldCheck } from "lucide-react";
import { AdminButton } from "../../components/admin/AdminButton";
import { AdminHeader } from "../../components/admin/AdminHeader";
import { EmptyState } from "../../components/admin/EmptyState";
import { ErrorPanel, Segmented } from "../../components/promotions/PromoUi";
import { Badge, type BadgeTone } from "../../components/ui/Badge";
import { useAdminLoungeModeration, useLoungeModerationStats, type QueueFilter } from "../../lib/adminLoungeModeration";
import {
  MUTE_DURATIONS,
  actionDraftErrors,
  availableActions,
  needsReason,
  type ActionDraft,
  type ActionDraftError,
  type AppealEntry,
  type ContextMessage,
  type HistoryEntry,
  type ModerationAction,
  type QueueEntry,
  type StaffLabel,
  type StatsPeriod,
} from "../../lib/adminLoungeModerationMapping";
import { ILLEGAL_CATEGORIES, REPORT_REASONS, TEXT_MAX, TEXT_MIN, type IllegalCategory, type ReportReason } from "../../lib/communityChat/moderation";
import { parseChannelId } from "../../lib/communityChat/model";
import { useToast } from "../../lib/toast";
import { useAdminShell } from "./AdminLayout";

type Tab = "reports" | "appeals" | "history" | "stats";

const field =
  "gt-field w-full rounded-[var(--admin-radius-sm)] border border-[var(--border-default)] bg-white px-3 py-2 text-[length:var(--text-body-sm)]";
const small = "text-[12.5px] text-[var(--text-muted)]";
const REPORT_TONE: Record<string, BadgeTone> = { open: "warning", actioned: "success", dismissed: "neutral" };
const APPEAL_TONE: Record<string, BadgeTone> = { open: "warning", upheld: "neutral", reversed: "success" };

function useDateTime() {
  const { i18n } = useTranslation();
  const format = useMemo(
    () => new Intl.DateTimeFormat(i18n.language === "en" ? "en-GB" : "fr-FR", { dateStyle: "medium", timeStyle: "short" }),
    [i18n.language],
  );
  return (iso: string | null) => (iso ? format.format(new Date(iso)) : "—");
}

function useLabels() {
  const { t } = useTranslation();
  return {
    member: (label: StaffLabel | null) => (label ? `${label.name ?? t("lounge.memberUnnamed")}${label.handle ? ` @${label.handle}` : ""}` : t("moderation.admin.erased")),
    reason: (reason: ReportReason | null, category: IllegalCategory | null) =>
      reason ? (category ? `${t(`lounge.moderation.reasons.${reason}`)} (${t(`lounge.moderation.categories.${category}`)})` : t(`lounge.moderation.reasons.${reason}`)) : null,
    room: (channelId: string | null) => {
      const parsed = channelId ? parseChannelId(channelId) : null;
      return parsed ? `${parsed.server.toUpperCase()} · #${parsed.key}` : t("moderation.admin.privateRoom");
    },
  };
}

/**
 * Members' Lounge moderation (`/admin/salons`, decision 132, permission
 * `moderate_community`): the reported messages grouped by message with their
 * context, the decisions (each with a statement the member receives by
 * e-mail, DSA art. 17), the complaints (art. 20) and the counters of the
 * transparency report. Every rule is the database's.
 */
export function AdminLounge() {
  const { t } = useTranslation();
  const { openNav } = useAdminShell();
  const [tab, setTab] = useState<Tab>("reports");
  const [queueFilter, setQueueFilter] = useState<QueueFilter>("open");
  const [appealFilter, setAppealFilter] = useState<QueueFilter>("open");
  const { data, state, reload, loadContext, decide, answerAppeal } = useAdminLoungeModeration(queueFilter, appealFilter);
  const openReports = data.queue.reduce((sum, e) => sum + e.openReports, 0);
  const openAppeals = data.appeals.filter((a) => a.status === "open").length;

  return (
    <>
      <AdminHeader
        title={t("moderation.admin.title")}
        description={t("moderation.admin.description")}
        crumbs={[{ label: t("admin.nav.dashboard"), to: "/admin" }, { label: t("admin.nav.lounge") }]}
        onOpenNav={openNav}
      />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 px-[var(--admin-gutter)] pb-[clamp(32px,5vw,56px)] pt-5">
        {state === "unavailable" ? (
          <div className="gt-admin-panel">
            <EmptyState icon={PlugZap} title={t("moderation.admin.unavailableTitle")} body={t("moderation.admin.unavailableBody")} />
          </div>
        ) : state === "forbidden" ? (
          <div className="gt-admin-panel">
            <EmptyState icon={Lock} title={t("moderation.admin.forbiddenTitle")} body={t("moderation.admin.forbiddenBody")} />
          </div>
        ) : state === "error" ? (
          <ErrorPanel title={t("moderation.admin.errorTitle")} body={t("moderation.admin.errorBody")} onRetry={reload} retryLabel={t("moderation.admin.retry")} />
        ) : (
          <>
            <Segmented<Tab>
              label={t("moderation.admin.tabsLabel")}
              hideLabel
              value={tab}
              onChange={setTab}
              options={[
                { value: "reports", label: t("moderation.admin.tabReports", { count: openReports }), icon: Flag },
                { value: "appeals", label: t("moderation.admin.tabAppeals", { count: openAppeals }), icon: Scale },
                { value: "history", label: t("moderation.admin.tabHistory"), icon: History },
                { value: "stats", label: t("moderation.admin.tabStats"), icon: BarChart3 },
              ]}
            />
            {state === "loading" && tab !== "stats" ? (
              <div role="status" className="grid gap-3">
                <span className="sr-only">{t("moderation.admin.loading")}</span>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="gt-skeleton h-28 rounded-[var(--admin-radius-sm)]" />
                ))}
              </div>
            ) : tab === "reports" ? (
              <section className="gt-admin-panel grid grid-cols-[minmax(0,1fr)] overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] p-4">
                  <Segmented<QueueFilter>
                    label={t("moderation.admin.filterLabel")}
                    hideLabel
                    size="sm"
                    value={queueFilter}
                    onChange={setQueueFilter}
                    options={[
                      { value: "open", label: t("moderation.admin.filterOpen") },
                      { value: "all", label: t("moderation.admin.filterAll") },
                    ]}
                  />
                  <p className={small}>{t("moderation.admin.nonMemberHint")}</p>
                </div>
                {data.queue.length === 0 ? (
                  <EmptyState icon={ShieldCheck} title={t("moderation.admin.emptyQueueTitle")} body={t("moderation.admin.emptyQueueBody")} />
                ) : (
                  <ul className="m-0 grid list-none p-0">
                    {data.queue.map((entry) => (
                      <QueueCard key={entry.messageId} entry={entry} images={data.images} loadContext={loadContext} decide={decide} />
                    ))}
                  </ul>
                )}
              </section>
            ) : tab === "appeals" ? (
              <section className="gt-admin-panel grid grid-cols-[minmax(0,1fr)] overflow-hidden">
                <div className="border-b border-[var(--border-subtle)] p-4">
                  <Segmented<QueueFilter>
                    label={t("moderation.admin.filterLabel")}
                    hideLabel
                    size="sm"
                    value={appealFilter}
                    onChange={setAppealFilter}
                    options={[
                      { value: "open", label: t("moderation.admin.filterOpenAppeals") },
                      { value: "all", label: t("moderation.admin.filterAll") },
                    ]}
                  />
                </div>
                {data.appeals.length === 0 ? (
                  <EmptyState icon={Scale} title={t("moderation.admin.emptyAppealsTitle")} body={t("moderation.admin.emptyAppealsBody")} />
                ) : (
                  <ul className="m-0 grid list-none p-0">
                    {data.appeals.map((appeal) => (
                      <AppealCard key={appeal.id} appeal={appeal} answer={answerAppeal} />
                    ))}
                  </ul>
                )}
              </section>
            ) : tab === "history" ? (
              <HistoryList entries={data.history} />
            ) : (
              <StatsPanel />
            )}
          </>
        )}
      </div>
    </>
  );
}

/* ------------------------------------------------------------- reported message */

function QueueCard({
  entry,
  images,
  loadContext,
  decide,
}: {
  entry: QueueEntry;
  images: Map<string, string>;
  loadContext: (messageId: string) => Promise<ContextMessage[] | null>;
  decide: (entry: QueueEntry, draft: ActionDraft) => Promise<"forbidden" | "invalid" | "failed" | null>;
}) {
  const { t } = useTranslation();
  const labels = useLabels();
  const when = useDateTime();
  const [context, setContext] = useState<ContextMessage[] | null | "loading" | "failed">(null);
  const [action, setAction] = useState<ModerationAction | null>(null);
  const now = Date.now();
  const muted = entry.authorMutedUntil !== null && Date.parse(entry.authorMutedUntil) > now;

  return (
    <li className="grid gap-3 border-b border-[var(--border-subtle)] p-4 last:border-b-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[14px] font-bold text-[var(--text-primary)]">{labels.member(entry.author)}</span>
        <span className={small}>{labels.room(entry.channelId)} · {when(entry.createdAt)}</span>
        {entry.author?.isStaff && <Badge size="sm" tone="brand">{t("moderation.admin.staff")}</Badge>}
        {entry.hidden && <Badge size="sm" tone="warning" icon={EyeOff}>{t("moderation.admin.hidden")}</Badge>}
        {muted && <Badge size="sm" tone="warning">{t("moderation.admin.mutedUntil", { date: when(entry.authorMutedUntil) })}</Badge>}
        {entry.authorBannedAt && <Badge size="sm" tone="error">{t("moderation.admin.excluded")}</Badge>}
        {entry.authorDecisions > 0 && <span className={small}>{t("moderation.admin.priorDecisions", { count: entry.authorDecisions })}</span>}
      </div>

      {entry.text && <p className="m-0 whitespace-pre-line rounded-[var(--admin-radius-sm)] bg-[var(--surface-sunken)] px-3 py-2 text-[14px] text-[var(--text-primary)]">{entry.text}</p>}
      {entry.attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {entry.attachments.map((a) =>
            images.get(a.path) ? (
              // eslint-disable-next-line @next/next/no-img-element -- signed Storage URL
              <img key={a.id} src={images.get(a.path)} alt={a.alt || t("moderation.admin.image")} className="h-28 w-28 rounded-[var(--admin-radius-sm)] object-cover" />
            ) : (
              <span key={a.id} className="grid h-28 w-28 place-items-center rounded-[var(--admin-radius-sm)] bg-[var(--surface-sunken)] text-[12px] text-[var(--text-muted)]">{t("moderation.admin.image")}</span>
            ),
          )}
        </div>
      )}

      <ul className="m-0 grid list-none gap-2 p-0">
        {entry.reports.map((report) => (
          <li key={report.id} className="grid gap-1 rounded-[var(--admin-radius-sm)] border border-[var(--border-subtle)] px-3 py-2 text-[13px]">
            <div className="flex flex-wrap items-center gap-2">
              <Flag size={13} aria-hidden="true" />
              <span className="font-semibold">{labels.reason(report.reason, report.category)}</span>
              <Badge size="sm" tone={REPORT_TONE[report.status]}>{t(`moderation.reportStatus.${report.status}`)}</Badge>
              <span className={small}>{t("moderation.admin.reportedBy", { name: labels.member(report.reporter), date: when(report.createdAt) })}</span>
              {report.attachmentId && <span className={small}>{t("moderation.admin.aboutImage")}</span>}
            </div>
            {report.details && <p className="m-0 whitespace-pre-line text-[var(--text-body)]">{report.details}</p>}
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        <AdminButton
          size="sm"
          variant="ghost"
          iconLeft={MessagesSquare}
          onClick={async () => {
            if (context && context !== "failed") return setContext(null);
            setContext("loading");
            setContext((await loadContext(entry.messageId)) ?? "failed");
          }}
        >
          {t(context && context !== "failed" ? "moderation.admin.hideContext" : "moderation.admin.showContext")}
        </AdminButton>
        {availableActions(entry, now).map((a) => (
          <AdminButton key={a} size="sm" variant={a === action ? "dark" : a === "delete" || a === "ban" ? "danger" : "outline"} onClick={() => setAction(a === action ? null : a)}>
            {t(`moderation.admin.do.${a}`)}
          </AdminButton>
        ))}
      </div>

      {context === "loading" && <p role="status" className={small}>{t("moderation.admin.loading")}</p>}
      {context === "failed" && <p className="m-0 text-[12.5px] text-[var(--status-error-fg)]">{t("moderation.admin.contextFailed")}</p>}
      {Array.isArray(context) && (
        <ol className="m-0 grid list-none gap-1 rounded-[var(--admin-radius-sm)] border border-dashed border-[var(--border-default)] p-3" aria-label={t("moderation.admin.contextLabel")}>
          {context.map((m) => (
            <li key={m.id} className={m.isTarget ? "rounded bg-[var(--status-warning-bg)] px-2 py-1" : "px-2 py-1"}>
              <span className="text-[12px] font-bold text-[var(--text-primary)]">{labels.member(m.author)}</span>{" "}
              <span className={small}>{when(m.createdAt)}</span>
              {m.hidden && <span className={small}> · {t("moderation.admin.hidden")}</span>}
              <p className="m-0 whitespace-pre-line text-[13px] text-[var(--text-body)]">
                {m.text || t("moderation.admin.imagesOnly", { count: m.attachmentCount })}
                {m.text && m.attachmentCount > 0 && ` + ${t("moderation.admin.imagesOnly", { count: m.attachmentCount })}`}
              </p>
            </li>
          ))}
        </ol>
      )}

      {action && <ActionForm key={action} entry={entry} action={action} decide={decide} onDone={() => setAction(null)} />}
    </li>
  );
}

function ActionForm({
  entry,
  action,
  decide,
  onDone,
}: {
  entry: QueueEntry;
  action: ModerationAction;
  decide: (entry: QueueEntry, draft: ActionDraft) => Promise<"forbidden" | "invalid" | "failed" | null>;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const id = useId();
  const [draft, setDraft] = useState<ActionDraft>({ action, reason: "", category: "", statement: "", muteHours: 24 });
  const [shown, setShown] = useState<ActionDraftError[]>([]);
  const [busy, setBusy] = useState(false);
  const adverse = needsReason(action);

  return (
    <form
      noValidate
      className="grid gap-3 rounded-[var(--admin-radius-sm)] border border-[var(--border-default)] bg-[var(--surface-card)] p-3"
      onSubmit={async (event) => {
        event.preventDefault();
        const errors = actionDraftErrors(draft);
        setShown(errors);
        if (errors.length) return;
        setBusy(true);
        const failure = await decide(entry, draft);
        setBusy(false);
        if (failure) showToast(t("moderation.admin.toasts.failed"), t(`moderation.admin.failures.${failure}`), "error");
        else {
          showToast(t(`moderation.admin.toasts.${action}`), t("moderation.admin.toasts.notified"), "success");
          onDone();
        }
      }}
    >
      <p className="m-0 text-[13.5px] font-bold text-[var(--text-primary)]">{t(`moderation.admin.confirm.${action}`)}</p>
      {adverse && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1">
            <label htmlFor={`${id}-reason`} className="text-[12.5px] font-bold">{t("moderation.admin.reasonLabel")}</label>
            <select
              id={`${id}-reason`}
              value={draft.reason}
              onChange={(e) => setDraft((d) => ({ ...d, reason: e.target.value as ActionDraft["reason"], category: "" }))}
              aria-invalid={shown.includes("reason") || undefined}
              className={field}
            >
              <option value="">{t("moderation.admin.choose")}</option>
              {REPORT_REASONS.map((r) => <option key={r} value={r}>{t(`lounge.moderation.reasons.${r}`)}</option>)}
            </select>
            {shown.includes("reason") && <p className="m-0 text-[12px] text-[var(--status-error-fg)]">{t("moderation.admin.errors.reason")}</p>}
          </div>
          {draft.reason === "illegal" && (
            <div className="grid gap-1">
              <label htmlFor={`${id}-category`} className="text-[12.5px] font-bold">{t("moderation.admin.categoryLabel")}</label>
              <select
                id={`${id}-category`}
                value={draft.category}
                onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value as ActionDraft["category"] }))}
                aria-invalid={shown.includes("category") || undefined}
                className={field}
              >
                <option value="">{t("moderation.admin.choose")}</option>
                {ILLEGAL_CATEGORIES.map((c) => <option key={c} value={c}>{t(`lounge.moderation.categories.${c}`)}</option>)}
              </select>
              {shown.includes("category") && <p className="m-0 text-[12px] text-[var(--status-error-fg)]">{t("moderation.admin.errors.category")}</p>}
            </div>
          )}
          {draft.reason && (
            <p className="m-0 text-[12.5px] text-[var(--text-muted)] sm:col-span-2">
              {t("moderation.admin.groundIs", { ground: t(`moderation.grounds.${draft.reason === "illegal" ? "illegal" : "terms"}`) })}
            </p>
          )}
        </div>
      )}
      {action === "mute" && (
        <div className="grid gap-1 sm:max-w-[260px]">
          <label htmlFor={`${id}-duration`} className="text-[12.5px] font-bold">{t("moderation.admin.durationLabel")}</label>
          <select id={`${id}-duration`} value={draft.muteHours} onChange={(e) => setDraft((d) => ({ ...d, muteHours: Number(e.target.value) as ActionDraft["muteHours"] }))} className={field}>
            {MUTE_DURATIONS.map((h) => <option key={h} value={h}>{t(`moderation.admin.durations.h${h}`)}</option>)}
          </select>
        </div>
      )}
      <div className="grid gap-1">
        <label htmlFor={`${id}-statement`} className="text-[12.5px] font-bold">{t("moderation.admin.statementLabel")}</label>
        <textarea
          id={`${id}-statement`}
          rows={3}
          maxLength={TEXT_MAX}
          value={draft.statement}
          autoFocus
          onChange={(e) => setDraft((d) => ({ ...d, statement: e.target.value }))}
          aria-invalid={shown.includes("statement") || undefined}
          className={`${field} resize-y`}
        />
        <p className={small}>{t(action === "dismiss" ? "moderation.admin.statementHintDismiss" : "moderation.admin.statementHint", { min: TEXT_MIN })}</p>
        {shown.includes("statement") && <p className="m-0 text-[12px] text-[var(--status-error-fg)]">{t("moderation.admin.errors.statement", { min: TEXT_MIN })}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <AdminButton size="sm" variant={action === "delete" || action === "ban" ? "danger" : "dark"} iconLeft={Gavel} type="submit" disabled={busy}>
          {t(`moderation.admin.do.${action}`)}
        </AdminButton>
        <AdminButton size="sm" variant="ghost" type="button" onClick={onDone} disabled={busy}>{t("moderation.admin.cancel")}</AdminButton>
      </div>
    </form>
  );
}

/* --------------------------------------------------------------------- complaints */

function AppealCard({ appeal, answer }: { appeal: AppealEntry; answer: (appeal: AppealEntry, outcome: "upheld" | "reversed", response: string) => Promise<"forbidden" | "invalid" | "failed" | null> }) {
  const { t } = useTranslation();
  const labels = useLabels();
  const when = useDateTime();
  const { showToast } = useToast();
  const id = useId();
  const [outcome, setOutcome] = useState<"upheld" | "reversed" | "">("");
  const [response, setResponse] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const d = appeal.decision;

  return (
    <li className="grid gap-3 border-b border-[var(--border-subtle)] p-4 last:border-b-0">
      <div className="flex flex-wrap items-center gap-2">
        <Scale size={15} aria-hidden="true" />
        <span className="text-[14px] font-bold text-[var(--text-primary)]">{labels.member(appeal.appellant)}</span>
        <Badge size="sm" tone="neutral">{t(`moderation.admin.appellant.${appeal.appellantRole}`)}</Badge>
        <Badge size="sm" tone={APPEAL_TONE[appeal.status]}>{t(`moderation.appealStatus.${appeal.status}`)}</Badge>
        <span className={small}>{when(appeal.createdAt)}</span>
      </div>
      {appeal.body && <p className="m-0 whitespace-pre-line text-[14px] text-[var(--text-primary)]">{appeal.body}</p>}
      <div className="grid gap-1 rounded-[var(--admin-radius-sm)] bg-[var(--surface-sunken)] p-3 text-[13px]">
        <p className="m-0 font-semibold">
          {t("moderation.admin.contested", { action: t(`moderation.actions.${d.action}`), date: when(d.createdAt), by: d.decidedBy ?? "—" })}
        </p>
        <p className="m-0">{t("moderation.admin.concerns", { name: labels.member(d.target) })}</p>
        {labels.reason(d.reason, d.category) && <p className="m-0">{labels.reason(d.reason, d.category)}</p>}
        {d.excerpt && <p className="m-0 whitespace-pre-line text-[var(--text-body)]">« {d.excerpt} »</p>}
        <p className="m-0 whitespace-pre-line text-[var(--text-muted)]">{d.statement}</p>
      </div>
      {appeal.status === "open" ? (
        <form
          noValidate
          className="grid gap-2"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!outcome) return setError(t("moderation.admin.errors.outcome"));
            if (response.trim().length < TEXT_MIN) return setError(t("moderation.admin.errors.statement", { min: TEXT_MIN }));
            setError(null);
            setBusy(true);
            const failure = await answer(appeal, outcome, response);
            setBusy(false);
            if (failure) showToast(t("moderation.admin.toasts.failed"), t(`moderation.admin.failures.${failure}`), "error");
            else showToast(t(`moderation.admin.toasts.appeal_${outcome}`), t("moderation.admin.toasts.notified"), "success");
          }}
        >
          <fieldset className="m-0 flex flex-wrap gap-4 border-0 p-0">
            <legend className="mb-1 p-0 text-[12.5px] font-bold">{t("moderation.admin.outcomeLabel")}</legend>
            {(["upheld", "reversed"] as const).map((o) => (
              <label key={o} className="flex items-center gap-2 text-[13.5px]">
                <input type="radio" name={`${id}-outcome`} checked={outcome === o} onChange={() => setOutcome(o)} />
                {t(`moderation.admin.outcomes.${o}`)}
              </label>
            ))}
          </fieldset>
          {outcome === "reversed" && <p className={small}>{t(`moderation.admin.reverseEffect.${appeal.appellantRole === "reporter" ? "reporter" : d.action}`, { defaultValue: t("moderation.admin.reverseEffect.other") })}</p>}
          <label htmlFor={`${id}-response`} className="text-[12.5px] font-bold">{t("moderation.admin.responseLabel")}</label>
          <textarea id={`${id}-response`} rows={3} maxLength={TEXT_MAX} value={response} onChange={(e) => setResponse(e.target.value)} className={`${field} resize-y`} />
          <p className={small}>{t("moderation.admin.responseHint")}</p>
          <div aria-live="polite" className="empty:hidden">{error && <p className="m-0 text-[12px] text-[var(--status-error-fg)]">{error}</p>}</div>
          <div>
            <AdminButton size="sm" variant="dark" type="submit" iconLeft={Check} disabled={busy}>{t("moderation.admin.sendAnswer")}</AdminButton>
          </div>
        </form>
      ) : (
        <p className="m-0 whitespace-pre-line text-[13px]">
          <span className="font-semibold">{t("moderation.admin.answeredBy", { by: appeal.answeredBy ?? "—", date: when(appeal.answeredAt) })} </span>
          {appeal.response}
        </p>
      )}
    </li>
  );
}

/* ------------------------------------------------------------------------ history */

function HistoryList({ entries }: { entries: HistoryEntry[] }) {
  const { t } = useTranslation();
  const labels = useLabels();
  const when = useDateTime();
  if (entries.length === 0) {
    return (
      <div className="gt-admin-panel">
        <EmptyState icon={ListChecks} title={t("moderation.admin.emptyHistoryTitle")} body={t("moderation.admin.emptyHistoryBody")} />
      </div>
    );
  }
  return (
    <section className="gt-admin-panel overflow-hidden">
      <ul className="m-0 grid list-none p-0">
        {entries.map((e) => (
          <li key={e.id} className="grid gap-1 border-b border-[var(--border-subtle)] p-4 text-[13px] last:border-b-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-[var(--text-primary)]">{t(`moderation.actions.${e.action}`)}</span>
              <span className={small}>{when(e.createdAt)} · {t("moderation.admin.decidedBy", { by: e.decidedBy ?? "—" })}</span>
              {e.appealId && <Badge size="sm" tone="success">{t("moderation.admin.afterAppeal")}</Badge>}
              {e.appeals > 0 && <Badge size="sm" tone="warning">{t("moderation.admin.appealsCount", { count: e.appeals })}</Badge>}
              {["hide", "delete", "mute", "ban"].includes(e.action) && (
                <Badge size="sm" tone={e.notified ? "success" : "neutral"} icon={e.notified ? Check : CircleAlert}>
                  {t(e.notified ? "moderation.admin.notified" : "moderation.admin.notNotified")}
                </Badge>
              )}
            </div>
            <p className="m-0">
              {t("moderation.admin.concerns", { name: labels.member(e.target) })}
              {labels.reason(e.reason, e.category) && ` · ${labels.reason(e.reason, e.category)}`}
              {e.ground && ` · ${t(`moderation.grounds.${e.ground}`)}`}
              {e.reportCount > 0 && ` · ${t("moderation.admin.reportsCount", { count: e.reportCount })}`}
            </p>
            {e.excerpt && <p className="m-0 whitespace-pre-line text-[var(--text-body)]">« {e.excerpt} »</p>}
            <p className="m-0 whitespace-pre-line text-[var(--text-muted)]">{e.statement}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* -------------------------------------------------------------------------- stats */

function StatsPanel() {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<StatsPeriod>("30d");
  const { loading, stats } = useLoungeModerationStats(period, true);
  const row = (label: string, value: string | number) => (
    <div key={label} className="grid gap-0.5 rounded-[var(--admin-radius-sm)] bg-[var(--surface-sunken)] px-3 py-2">
      <dt className="text-[12px] text-[var(--text-muted)]">{label}</dt>
      <dd className="m-0 text-[18px] font-[var(--weight-black)] tabular-nums text-[var(--text-primary)]">{value}</dd>
    </div>
  );
  const hours = (h: number | null) => (h === null ? "—" : t("moderation.admin.hours", { count: h }));
  return (
    <section className="gt-admin-panel grid gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented<StatsPeriod>
          label={t("moderation.admin.periodLabel")}
          hideLabel
          size="sm"
          value={period}
          onChange={setPeriod}
          options={[
            { value: "30d", label: t("moderation.admin.period30d") },
            { value: "year", label: t("moderation.admin.periodYear") },
            { value: "12m", label: t("moderation.admin.period12m") },
          ]}
        />
        <p className={small}>{t("moderation.admin.statsHint")}</p>
      </div>
      {loading ? (
        <p role="status" className={small}>{t("moderation.admin.loading")}</p>
      ) : !stats ? (
        <p className="m-0 text-[13px] text-[var(--status-error-fg)]">{t("moderation.admin.errorBody")}</p>
      ) : (
        <>
          <dl className="m-0 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {row(t("moderation.admin.stats.reports"), stats.reports)}
            {row(t("moderation.admin.stats.nonMember"), stats.nonMemberNotices)}
            {row(t("moderation.admin.stats.medianDecision"), hours(stats.medianHoursToDecision))}
            {row(t("moderation.admin.stats.automated"), stats.automatedDecisions)}
            {row(t("moderation.admin.stats.appeals"), stats.appeals)}
            {row(t("moderation.admin.stats.medianAnswer"), hours(stats.medianHoursToAnswer))}
            {row(t("moderation.admin.stats.openNow"), `${stats.openReports} / ${stats.openAppeals}`)}
            {row(t("moderation.admin.stats.restrictedNow"), `${stats.mutedNow} / ${stats.excludedNow}`)}
          </dl>
          <div className="grid gap-4 md:grid-cols-2">
            <Breakdown title={t("moderation.admin.stats.byReason")} entries={REPORT_REASONS.map((r) => [t(`lounge.moderation.reasons.${r}`), stats.reportsByReason[r] ?? 0])} />
            <Breakdown title={t("moderation.admin.stats.byCategory")} entries={ILLEGAL_CATEGORIES.map((c) => [t(`lounge.moderation.categories.${c}`), stats.reportsByCategory[c] ?? 0])} />
            <Breakdown
              title={t("moderation.admin.stats.byAction")}
              entries={(["dismiss", "hide", "restore", "delete", "mute", "ban", "lift"] as const).map((a) => [t(`moderation.actions.${a}`), stats.decisionsByAction[a] ?? 0])}
            />
            <Breakdown
              title={t("moderation.admin.stats.byGroundAndOutcome")}
              entries={[
                [t("moderation.grounds.terms"), stats.decisionsByGround.terms ?? 0],
                [t("moderation.grounds.illegal"), stats.decisionsByGround.illegal ?? 0],
                [t("moderation.admin.outcomes.upheld"), stats.appealsByOutcome.upheld ?? 0],
                [t("moderation.admin.outcomes.reversed"), stats.appealsByOutcome.reversed ?? 0],
              ]}
            />
          </div>
        </>
      )}
    </section>
  );
}

function Breakdown({ title, entries }: { title: string; entries: Array<[string, number]> }) {
  return (
    <div className="grid gap-2">
      <h3 className="m-0 text-[13px] font-bold text-[var(--text-primary)]">{title}</h3>
      <table className="w-full text-[13px]">
        <tbody>
          {entries.map(([label, value]) => (
            <tr key={label} className="border-b border-[var(--border-subtle)] last:border-b-0">
              <th scope="row" className="py-1 text-left font-normal">{label}</th>
              <td className="py-1 text-right tabular-nums">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

