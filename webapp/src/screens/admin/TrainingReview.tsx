import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import {
  Check,
  CircleCheck,
  Eye,
  Upload,
  TriangleAlert,
  Wrench,
  X,
} from "lucide-react";
import clsx from "clsx";
import { AdminButton } from "../../components/admin/AdminButton";
import { AdminHeader } from "../../components/admin/AdminHeader";
import { ConfirmationDialog } from "../../components/admin/ConfirmationDialog";
import { CountRow, StatusBadge } from "../../components/admin/training/TrainingPrimitives";
import { questionCount, quizCount, stepCount } from "../../data/adminTraining";
import { useAdminTraining } from "../../lib/adminTraining";
import { analyseCourse, type ReadinessIssue } from "../../lib/trainingReadiness";
import { useLocalized } from "../../lib/localized";
import { useToast } from "../../lib/toast";
import { useAdminShell } from "./AdminLayout";

/**
 * Review and publish.
 *
 * The screen answers one question — is this course ready — and it answers it in
 * two registers. The checklist says what exists; the issue list says what is
 * wrong and, for each entry, opens the exact module or step that needs fixing.
 * An audit that reports a problem without a way to it just moves the search
 * somewhere else.
 *
 * Blocking issues disable publishing. Recommendations do not: an image caption
 * nobody wrote is not a reason to keep a finished course off the catalogue, and
 * a check that blocks on everything is a check people learn to route around.
 */
export function TrainingReview() {
  const { t, i18n } = useTranslation();
  const L = useLocalized();
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { openNav } = useAdminShell();
  const { showToast } = useToast();
  const { getCourse, setCourseStatus, saving } = useAdminTraining();

  const [publishing, setPublishing] = useState(false);
  const [unpublishing, setUnpublishing] = useState(false);

  const course = getCourse(id);
  const readiness = useMemo(() => (course ? analyseCourse(course) : null), [course]);

  if (!course || !readiness) return <Navigate to="/admin/formations" replace />;

  const title = L(course.title) || t("admin.training.create.fieldTitlePlaceholder");
  const builderPath = `/admin/formations/${course.id}`;

  const openIssue = (issue: ReadinessIssue) => {
    const params = new URLSearchParams();
    if (issue.moduleId) params.set("module", issue.moduleId);
    if (issue.stepId) params.set("etape", issue.stepId);
    navigate(`${builderPath}${params.toString() ? `?${params}` : ""}`);
  };

  const publish = async () => {
    await setCourseStatus(course.id, "published");
    setPublishing(false);
    showToast(
      t("admin.training.toasts.publishedTitle"),
      t("admin.training.toasts.publishedBody", { name: title }),
    );
  };

  return (
    <>
      <AdminHeader
        title={t("admin.training.review.title")}
        description={title}
        crumbs={[
          { label: t("admin.nav.dashboard"), to: "/admin" },
          { label: t("admin.nav.training"), to: "/admin/formations" },
          { label: title, to: builderPath },
          { label: t("admin.training.review.title") },
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
            {course.status === "published" ? (
              <AdminButton variant="dark" iconLeft={Upload} onClick={() => setUnpublishing(true)}>
                {t("admin.training.actions.unpublish")}
              </AdminButton>
            ) : (
              <AdminButton
                variant="primary"
                iconLeft={Upload}
                disabled={!readiness.publishable}
                onClick={() => setPublishing(true)}
              >
                {t("admin.training.actions.publish")}
              </AdminButton>
            )}
          </>
        }
      />

      <div className="grid gap-4 px-[var(--admin-gutter)] pb-[clamp(32px,5vw,56px)] pt-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid min-w-0 gap-4">
          {/* Verdict */}
          <section
            className={clsx(
              "gt-admin-panel grid gap-3 p-5",
              readiness.publishable
                ? "border-[var(--gt-emerald-500)] bg-[var(--gt-emerald-50)]"
                : "border-[var(--gt-amber-400)] bg-[var(--status-warning-bg)]",
            )}
          >
            <div className="flex flex-wrap items-start gap-3">
              <span
                aria-hidden="true"
                className={clsx(
                  "grid h-10 w-10 flex-none place-items-center rounded-full",
                  readiness.publishable
                    ? "bg-[var(--gt-emerald-500)] text-[var(--gt-white)]"
                    : "bg-[var(--gt-amber-400)] text-[var(--gt-ink-900)]",
                )}
              >
                {readiness.publishable ? (
                  <CircleCheck size={20} strokeWidth={2.2} />
                ) : (
                  <TriangleAlert size={20} strokeWidth={2.2} />
                )}
              </span>
              <div className="grid min-w-0 flex-1 gap-0.5">
                <h2 className="text-[length:var(--text-h3)]">
                  {readiness.publishable
                    ? t("admin.training.review.ready")
                    : t("admin.training.review.notReady")}
                </h2>
                <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-body)]">
                  {readiness.publishable
                    ? t("admin.training.review.readyBody")
                    : t("admin.training.review.notReadyBody")}
                </p>
              </div>
              <StatusBadge status={course.status} />
            </div>

            <div className="grid gap-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)]">
                  {t("admin.training.review.readiness")}
                </span>
                <span className="text-[length:var(--text-caption)] tabular-nums text-[var(--text-body)]">
                  {t("admin.training.review.readinessScore", { score: readiness.score })}
                </span>
              </div>
              <div
                role="progressbar"
                aria-valuenow={readiness.score}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={t("admin.training.review.readiness")}
                className="h-2 overflow-hidden rounded-[var(--radius-pill)] bg-[rgba(255,255,255,.6)]"
              >
                <span
                  className={clsx(
                    "block h-full rounded-[var(--radius-pill)]",
                    readiness.publishable ? "bg-[var(--gt-emerald-500)]" : "bg-[var(--gt-amber-600)]",
                  )}
                  style={{ width: `${readiness.score}%` }}
                />
              </div>
            </div>
          </section>

          {/* Checklist */}
          <section className="gt-admin-panel p-5">
            <h2 className="mb-3 text-[length:var(--text-h4)]">{t("admin.training.review.checksTitle")}</h2>
            <ul className="m-0 grid list-none gap-1 p-0">
              {readiness.checks.map((check) => (
                <li
                  key={check.id}
                  className="flex items-center gap-2.5 border-b border-[var(--border-subtle)] py-2 last:border-0"
                >
                  <span
                    aria-hidden="true"
                    className={clsx(
                      "grid h-5 w-5 flex-none place-items-center rounded-full",
                      check.ok
                        ? "bg-[var(--gt-emerald-500)] text-[var(--gt-white)]"
                        : "bg-[var(--surface-sunken)] text-[var(--text-subtle)]",
                    )}
                  >
                    {check.ok ? <Check size={12} strokeWidth={3} /> : <X size={12} strokeWidth={3} />}
                  </span>
                  <span
                    className={clsx(
                      "flex-1 text-[length:var(--text-body-sm)]",
                      check.ok ? "text-[var(--text-body)]" : "text-[var(--text-muted)]",
                    )}
                  >
                    {t(`admin.training.review.checks.${check.labelKey}`, check.params ?? {})}
                  </span>
                  {/* The state as a word, so the tick is not the only carrier. */}
                  <span
                    className={clsx(
                      "flex-none text-[length:var(--text-caption)] font-semibold",
                      check.ok ? "text-[var(--status-success-fg)]" : "text-[var(--text-subtle)]",
                    )}
                  >
                    {check.ok ? t("admin.training.preview.done") : t("admin.training.review.fix")}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {/* Issues */}
          {readiness.blocking.length > 0 && (
            <IssueList
              title={t("admin.training.review.blockingTitle")}
              tone="blocking"
              issues={readiness.blocking}
              onOpen={openIssue}
            />
          )}

          {readiness.warnings.length > 0 && (
            <IssueList
              title={t("admin.training.review.warningsTitle")}
              tone="warning"
              issues={readiness.warnings}
              onOpen={openIssue}
            />
          )}

          {readiness.issues.length === 0 && (
            <p className="m-0 flex items-center gap-2 rounded-[var(--admin-radius)] border border-[var(--gt-emerald-500)] bg-[var(--gt-emerald-50)] p-4 text-[length:var(--text-body-sm)] text-[var(--accent-cta-ink)]">
              <CircleCheck size={16} strokeWidth={2.2} aria-hidden="true" />
              {t("admin.training.review.issuesNone")}
            </p>
          )}
        </div>

        {/* Summary */}
        <aside className="grid h-fit gap-3 xl:sticky xl:top-[calc(var(--admin-header-h)+20px)]">
          <section className="gt-admin-panel overflow-hidden">
            <img src={course.cover} alt="" aria-hidden="true" className="aspect-[16/9] w-full object-cover" />
            <div className="grid gap-3 p-4">
              <h2 className="text-[length:var(--text-h4)]">{title}</h2>
              <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
                {L(course.shortDescription)}
              </p>

              <CountRow
                modules={course.modules.length}
                steps={stepCount(course)}
                quizzes={quizCount(course)}
              />

              <dl className="m-0 grid gap-1.5 border-t border-[var(--border-subtle)] pt-3">
                <Row label={t("admin.training.list.questions", { count: questionCount(course) })} value={questionCount(course)} />
                <Row label={t("admin.training.create.fieldLevel")} value={t(`admin.training.level.${course.level}`)} />
                <Row
                  label={t("admin.training.create.fieldCategory")}
                  value={t(`admin.training.category.${course.category}`)}
                />
                <Row
                  label={t("admin.training.list.updated")}
                  value={new Date(course.updatedAt).toLocaleDateString(i18n.language, {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                />
              </dl>

              <div className="grid gap-2 border-t border-[var(--border-subtle)] pt-3">
                <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">
                  {t(`admin.training.statusHelp.${course.status}`)}
                </p>
                {course.status === "published" ? (
                  <AdminButton variant="dark" fullWidth iconLeft={Upload} onClick={() => setUnpublishing(true)}>
                    {t("admin.training.actions.unpublish")}
                  </AdminButton>
                ) : (
                  <>
                    <AdminButton
                      variant="primary"
                      fullWidth
                      iconLeft={Upload}
                      disabled={!readiness.publishable}
                      onClick={() => setPublishing(true)}
                    >
                      {t("admin.training.actions.publish")}
                    </AdminButton>
                    {!readiness.publishable && (
                      <p className="m-0 text-[length:var(--text-caption)] text-[var(--status-warning-fg)]">
                        {t("admin.training.review.blockedNote")}
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          </section>
        </aside>
      </div>

      <ConfirmationDialog
        open={publishing}
        icon={Upload}
        title={t("admin.training.publish.title")}
        body={
          <>
            <p className="m-0">{t("admin.training.publish.body")}</p>
            {readiness.warnings.length > 0 && (
              <p className="m-0 mt-2 text-[var(--status-warning-fg)]">
                {t("admin.training.publish.warningsBody", { count: readiness.warnings.length })}
              </p>
            )}
          </>
        }
        confirmLabel={t("admin.training.publish.confirm")}
        cancelLabel={t("common.cancel")}
        loading={saving}
        onConfirm={publish}
        onCancel={() => setPublishing(false)}
      />

      <ConfirmationDialog
        open={unpublishing}
        icon={Upload}
        title={t("admin.training.publish.unpublishTitle")}
        body={<p className="m-0">{t("admin.training.publish.unpublishBody")}</p>}
        confirmLabel={t("admin.training.publish.unpublishConfirm")}
        cancelLabel={t("common.cancel")}
        loading={saving}
        onConfirm={async () => {
          await setCourseStatus(course.id, "unpublished");
          setUnpublishing(false);
          showToast(
            t("admin.training.toasts.unpublishedTitle"),
            t("admin.training.toasts.unpublishedBody", { name: title }),
            "info",
          );
        }}
        onCancel={() => setUnpublishing(false)}
      />
    </>
  );
}

function IssueList({
  title,
  tone,
  issues,
  onOpen,
}: {
  title: string;
  tone: "blocking" | "warning";
  issues: ReadinessIssue[];
  onOpen: (issue: ReadinessIssue) => void;
}) {
  const { t } = useTranslation();
  return (
    <section className="gt-admin-panel p-5">
      <h2 className="mb-1 flex items-center gap-2 text-[length:var(--text-h4)]">
        <TriangleAlert
          size={16}
          strokeWidth={2}
          aria-hidden="true"
          className={tone === "blocking" ? "text-[var(--status-error-fg)]" : "text-[var(--status-warning-fg)]"}
        />
        {title}
      </h2>
      <p className="m-0 mb-3 text-[length:var(--text-caption)] text-[var(--text-muted)]">
        {tone === "blocking"
          ? t("admin.training.review.blocking", { count: issues.length })
          : t("admin.training.review.warnings", { count: issues.length })}
      </p>

      <ul className="m-0 grid list-none gap-1.5 p-0">
        {issues.map((issue) => (
          <li
            key={issue.id}
            className={clsx(
              "flex flex-wrap items-center gap-3 rounded-[var(--admin-radius-sm)] border-l-[3px] bg-[var(--admin-panel-sunken)] py-2.5 pl-3 pr-2.5",
              tone === "blocking" ? "border-l-[var(--gt-red-500)]" : "border-l-[var(--gt-amber-400)]",
            )}
          >
            <span className="min-w-0 flex-1 text-[length:var(--text-body-sm)] text-[var(--text-body)]">
              {t(`admin.training.review.issues.${issue.messageKey}`, issue.params ?? {})}
            </span>
            {(issue.moduleId || issue.stepId) && (
              <AdminButton variant="outline" size="sm" iconLeft={Wrench} onClick={() => onOpen(issue)}>
                {t("admin.training.review.fix")}
              </AdminButton>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[length:var(--text-caption)] text-[var(--text-muted)]">{label}</dt>
      <dd className="m-0 text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)]">{value}</dd>
    </div>
  );
}
