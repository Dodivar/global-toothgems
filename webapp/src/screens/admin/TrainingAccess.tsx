"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useNavigate, useParams } from "../../lib/navigation";
import { Award, Eye, UserMinus, UserPlus, Users, Wrench } from "lucide-react";
import { AdminButton } from "../../components/admin/AdminButton";
import { AdminHeader } from "../../components/admin/AdminHeader";
import { ConfirmationDialog } from "../../components/admin/ConfirmationDialog";
import { EmptyState } from "../../components/admin/EmptyState";
import { FormField } from "../../components/admin/FormField";
import { stepCount } from "../../data/adminTraining";
import { useAdminTraining } from "../../lib/adminTraining";
import {
  CourseAccessError,
  courseAccessBackend,
  isActiveHolder,
  isEmailLike,
  type AccessErrorKind,
  type CourseHolder,
} from "../../lib/adminCourseAccess";
import { useFormat } from "../../lib/format";
import { useLocalized } from "../../lib/localized";
import { useToast } from "../../lib/toast";
import { useAdminShell } from "./AdminLayout";

/**
 * Who holds a course, and giving it to a member by hand.
 *
 * Until checkout sells courses (phase D), this is how a member gets a course:
 * the trainer types the member's account e-mail, optionally an end date and a
 * note, and the database grants the access (`admin_grant_course()`, audited).
 * Revoking takes the access away at once; what the member completed and any
 * certificate stay on record. Only a course that was ever published can be
 * given — a draft has nothing a member could open.
 */
export function TrainingAccess() {
  const { t } = useTranslation();
  const L = useLocalized();
  const { formatDate } = useFormat();
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { openNav } = useAdminShell();
  const { showToast } = useToast();
  const { getCourse, loading } = useAdminTraining();
  const course = getCourse(id);

  const [holders, setHolders] = useState<CourseHolder[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [email, setEmail] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [note, setNote] = useState("");
  const [emailError, setEmailError] = useState<string | undefined>();
  const [granting, setGranting] = useState(false);
  const [revoking, setRevoking] = useState<CourseHolder | null>(null);
  const [busyRevoke, setBusyRevoke] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoadFailed(false);
    try {
      setHolders(await courseAccessBackend.list(id));
    } catch {
      setLoadFailed(true);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!course) {
    return loading ? (
      <p className="m-0 p-8 text-center text-[var(--text-muted)]" role="status">
        {t("admin.training.builder.loading")}
      </p>
    ) : (
      <Navigate to="/admin/formations" replace />
    );
  }

  const title = L(course.title) || t("admin.training.create.fieldTitlePlaceholder");
  const builderPath = `/admin/formations/${course.id}`;
  const grantable = Boolean(course.publishedAt);
  const steps = stepCount(course);

  const errorText = (kind: AccessErrorKind) => t(`admin.training.access.errors.${kind}`);

  const grant = async (event: FormEvent) => {
    event.preventDefault();
    if (!isEmailLike(email)) {
      setEmailError(t("admin.training.access.errors.email"));
      return;
    }
    setEmailError(undefined);
    setGranting(true);
    try {
      // The end date is the end of that day in the trainer's time zone.
      const expiresAt = expiresOn ? new Date(`${expiresOn}T23:59:59`).toISOString() : null;
      await courseAccessBackend.grant(course.id, { email, expiresAt, note });
      showToast(t("admin.training.access.grantedTitle"), t("admin.training.access.grantedBody", { email: email.trim(), title }));
      setEmail("");
      setExpiresOn("");
      setNote("");
      await load();
    } catch (error) {
      const kind = error instanceof CourseAccessError ? error.kind : "network";
      if (kind === "memberNotFound" || kind === "alreadyHeld") setEmailError(errorText(kind));
      else showToast(t("admin.training.access.failedTitle"), errorText(kind), "error");
    } finally {
      setGranting(false);
    }
  };

  const revoke = async () => {
    if (!revoking) return;
    setBusyRevoke(true);
    try {
      await courseAccessBackend.revoke(revoking.id);
      showToast(t("admin.training.access.revokedTitle"), t("admin.training.access.revokedBody", { email: revoking.email }));
      setRevoking(null);
      await load();
    } catch (error) {
      const kind = error instanceof CourseAccessError ? error.kind : "network";
      showToast(t("admin.training.access.failedTitle"), errorText(kind), "error");
    } finally {
      setBusyRevoke(false);
    }
  };

  const active = (holders ?? []).filter((h) => isActiveHolder(h));
  const past = (holders ?? []).filter((h) => !isActiveHolder(h));

  return (
    <>
      <AdminHeader
        title={t("admin.training.access.title")}
        description={title}
        crumbs={[
          { label: t("admin.nav.dashboard"), to: "/admin" },
          { label: t("admin.nav.training"), to: "/admin/formations" },
          { label: title, to: builderPath },
          { label: t("admin.training.access.title") },
        ]}
        onOpenNav={openNav}
        actions={
          <>
            <AdminButton variant="outline" iconLeft={Wrench} onClick={() => navigate(builderPath)}>
              <span className="hidden xl:inline">{t("admin.training.actions.openBuilder")}</span>
            </AdminButton>
            <AdminButton variant="outline" iconLeft={Eye} onClick={() => navigate(`${builderPath}/apercu`)}>
              <span className="hidden xl:inline">{t("admin.training.actions.preview")}</span>
            </AdminButton>
          </>
        }
      />

      <div className="grid gap-4 px-[var(--admin-gutter)] pb-[clamp(32px,5vw,56px)] pt-5 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
        <section className="gt-admin-panel grid min-w-0 gap-4 p-5" aria-labelledby="access-holders">
          <div className="grid gap-1">
            <h2 id="access-holders" className="text-[length:var(--text-h4)]">
              {t("admin.training.access.holdersTitle", { count: active.length })}
            </h2>
            <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">{t("admin.training.access.holdersBody")}</p>
          </div>

          {loadFailed ? (
            <div role="alert" className="grid justify-items-start gap-2">
              <p className="m-0 text-[length:var(--text-body-sm)]">{t("admin.training.access.loadFailed")}</p>
              <AdminButton variant="outline" size="sm" onClick={() => void load()}>
                {t("admin.training.access.retry")}
              </AdminButton>
            </div>
          ) : holders === null ? (
            <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]" role="status">
              {t("admin.training.access.loading")}
            </p>
          ) : holders.length === 0 ? (
            <EmptyState icon={Users} title={t("admin.training.access.emptyTitle")} body={t("admin.training.access.emptyBody")} />
          ) : (
            <ul className="m-0 grid list-none gap-2 p-0">
              {[...active, ...past].map((holder) => {
                const live = isActiveHolder(holder);
                return (
                  <li
                    key={holder.id}
                    className="grid gap-2 rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                  >
                    <div className="grid min-w-0 gap-0.5">
                      <span className="truncate font-semibold text-[var(--text-primary)]">{holder.name ?? holder.email}</span>
                      {holder.name && <span className="truncate text-[length:var(--text-caption)] text-[var(--text-muted)]">{holder.email}</span>}
                      <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
                        {t(`admin.training.access.source.${holder.source}`)} · {t("admin.training.access.since", { date: formatDate(holder.startsAt) })}
                        {holder.expiresAt && ` · ${t("admin.training.access.until", { date: formatDate(holder.expiresAt) })}`}
                        {holder.grantedBy && ` · ${t("admin.training.access.by", { name: holder.grantedBy })}`}
                      </span>
                      <span className="text-[length:var(--text-caption)] text-[var(--text-body)]">
                        {holder.completedAt ? (
                          <span className="inline-flex items-center gap-1">
                            <Award size={12} aria-hidden="true" />
                            {t("admin.training.access.completed", { date: formatDate(holder.completedAt) })}
                            {holder.certificateCode && ` · ${holder.certificateCode}`}
                          </span>
                        ) : (
                          t("admin.training.access.progress", { done: Math.min(holder.stepsDone, steps), total: steps })
                        )}
                      </span>
                      {holder.note && <span className="text-[length:var(--text-caption)] italic text-[var(--text-muted)]">{holder.note}</span>}
                    </div>
                    {live ? (
                      <AdminButton
                        variant="ghost"
                        size="sm"
                        iconLeft={UserMinus}
                        onClick={() => setRevoking(holder)}
                        aria-label={t("admin.training.access.revokeFor", { email: holder.email })}
                      >
                        {t("admin.training.access.revoke")}
                      </AdminButton>
                    ) : (
                      <span className="text-[length:var(--text-caption)] font-semibold text-[var(--text-muted)]">
                        {holder.revokedAt
                          ? t("admin.training.access.revokedOn", { date: formatDate(holder.revokedAt) })
                          : t("admin.training.access.expired")}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="gt-admin-panel grid gap-4 p-5" aria-labelledby="access-grant">
          <div className="grid gap-1">
            <h2 id="access-grant" className="text-[length:var(--text-h4)]">
              {t("admin.training.access.grantTitle")}
            </h2>
            <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
              {grantable ? t("admin.training.access.grantBody") : t("admin.training.access.notPublished")}
            </p>
          </div>
          <form className="grid gap-4" onSubmit={grant} noValidate>
            <FormField label={t("admin.training.access.email")} hint={t("admin.training.access.emailHint")} error={emailError} required>
              {(field) => (
                <input
                  {...field}
                  type="email"
                  autoComplete="off"
                  className="gt-admin-field"
                  value={email}
                  disabled={!grantable || granting}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setEmailError(undefined);
                  }}
                />
              )}
            </FormField>
            <FormField label={t("admin.training.access.expires")} hint={t("admin.training.access.expiresHint")}>
              {(field) => (
                <input
                  {...field}
                  type="date"
                  className="gt-admin-field"
                  value={expiresOn}
                  disabled={!grantable || granting}
                  onChange={(e) => setExpiresOn(e.target.value)}
                />
              )}
            </FormField>
            <FormField label={t("admin.training.access.note")} hint={t("admin.training.access.noteHint")}>
              {(field) => (
                <input
                  {...field}
                  type="text"
                  maxLength={500}
                  className="gt-admin-field"
                  value={note}
                  disabled={!grantable || granting}
                  onChange={(e) => setNote(e.target.value)}
                />
              )}
            </FormField>
            <div>
              <AdminButton type="submit" variant="primary" iconLeft={UserPlus} disabled={!grantable || granting || !email.trim()}>
                {granting ? t("admin.training.access.granting") : t("admin.training.access.grant")}
              </AdminButton>
            </div>
          </form>
        </section>
      </div>

      <ConfirmationDialog
        open={revoking !== null}
        tone="danger"
        icon={UserMinus}
        title={t("admin.training.access.revokeTitle")}
        body={t("admin.training.access.revokeBody", { email: revoking?.email ?? "", title })}
        confirmLabel={t("admin.training.access.revoke")}
        cancelLabel={t("admin.training.access.cancel")}
        loading={busyRevoke}
        onConfirm={() => void revoke()}
        onCancel={() => setRevoking(null)}
      />
    </>
  );
}
