"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "../../lib/navigation";
import { GraduationCap, Images, Plus, Trash2, TriangleAlert, Upload } from "lucide-react";
import { AdminButton } from "../../components/admin/AdminButton";
import { AdminHeader } from "../../components/admin/AdminHeader";
import { ConfirmationDialog } from "../../components/admin/ConfirmationDialog";
import { EmptyState } from "../../components/admin/EmptyState";
import { StatCard } from "../../components/admin/StatCard";
import { CourseCard, type CourseActions } from "../../components/admin/training/CourseCard";
import { StatusBadge } from "../../components/admin/training/TrainingPrimitives";
import { trainingErrorMessage } from "../../components/admin/training/trainingErrors";
import { MEDIA_LIBRARY_PATH } from "../../components/admin/training/MediaPickerDialog";
import { useAdminTraining } from "../../lib/adminTraining";
import { useLocalized } from "../../lib/localized";
import { useToast } from "../../lib/toast";
import { groupCoursesByStatus } from "../../lib/trainingFilters";
import type { CourseStatus, TrainingCourse } from "../../data/adminTraining";
import { useAdminShell } from "./AdminLayout";

/**
 * The training catalogue.
 *
 * A handful of courses, so no search or filters (owner's decision,
 * 2026-10-21): the cards are grouped by status — on sale, drafts, withdrawn —
 * most recently changed first, and the figures at the top jump to a section.
 * A course is a hierarchy, not a row, so each card shows its own structure.
 */
export function Training() {
  const { t } = useTranslation();
  const L = useLocalized();
  const navigate = useNavigate();
  const { openNav } = useAdminShell();
  const { showToast } = useToast();
  const { courses, loading, loadError, reload, duplicateCourse, deleteCourse, setCourseStatus } = useAdminTraining();

  const [deleting, setDeleting] = useState<TrainingCourse | null>(null);
  const [unpublishing, setUnpublishing] = useState<TrainingCourse | null>(null);
  const [pending, setPending] = useState(false);

  const groups = useMemo(() => groupCoursesByStatus(courses), [courses]);

  const stats = useMemo(
    () => ({
      total: courses.length,
      published: courses.filter((c) => c.status === "published").length,
      drafts: courses.filter((c) => c.status === "draft").length,
      learners: courses.reduce((total, c) => total + c.enrolled, 0),
    }),
    [courses],
  );

  const actions: CourseActions = {
    onEdit: (course) => navigate(`/admin/formations/${course.id}`),
    onPreview: (course) => navigate(`/admin/formations/${course.id}/apercu`),
    onReview: (course) => navigate(`/admin/formations/${course.id}/publication`),
    onAccess: (course) => navigate(`/admin/formations/${course.id}/acces`),
    onDuplicate: async (course) => {
      try {
        const copy = await duplicateCourse(course.id);
        if (copy) {
          showToast(
            t("admin.training.toasts.duplicatedTitle"),
            t("admin.training.toasts.duplicatedBody", { name: L(copy.title) }),
          );
        }
      } catch (error) {
        const message = trainingErrorMessage(t, error);
        showToast(message.title, message.body, "error");
      }
    },
    onUnpublish: (course) => setUnpublishing(course),
    onDelete: (course) => setDeleting(course),
  };

  return (
    <>
      <AdminHeader
        title={t("admin.training.list.title")}
        description={t("admin.training.list.description")}
        crumbs={[{ label: t("admin.nav.dashboard"), to: "/admin" }, { label: t("admin.nav.training") }]}
        onOpenNav={openNav}
        actions={
          <>
            <AdminButton
              variant="outline"
              iconLeft={Images}
              onClick={() => navigate(MEDIA_LIBRARY_PATH)}
              aria-label={t("admin.training.actions.mediaLibrary")}
            >
              <span className="hidden sm:inline">{t("admin.training.actions.mediaLibrary")}</span>
            </AdminButton>
            <AdminButton variant="primary" iconLeft={Plus} onClick={() => navigate("/admin/formations/nouvelle")}>
              {t("admin.training.list.create")}
            </AdminButton>
          </>
        }
      />

      <div className="grid gap-4 px-[var(--admin-gutter)] pb-[clamp(32px,5vw,56px)] pt-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label={t("admin.training.list.metricTotal")}
            value={stats.total}
            hint={t("admin.training.list.description")}
            icon={GraduationCap}
            tone="brand"
            to="#formations-sections"
            linkLabel={t("admin.training.list.metricTotal")}
          />
          <StatCard
            label={t("admin.training.list.metricPublished")}
            value={stats.published}
            hint={t("admin.training.statusHelp.published")}
            icon={Upload}
            tone="success"
            to="#formations-published"
            linkLabel={t("admin.training.list.metricPublished")}
          />
          <StatCard
            label={t("admin.training.list.metricDrafts")}
            value={stats.drafts}
            hint={t("admin.training.statusHelp.draft")}
            icon={Plus}
            tone="warning"
            to="#formations-draft"
            linkLabel={t("admin.training.list.metricDrafts")}
          />
          <StatCard
            label={t("admin.training.list.metricLearners")}
            value={stats.learners}
            hint={t("admin.training.list.completion")}
            icon={GraduationCap}
            to="/admin/clients?formation=has"
            linkLabel={t("admin.training.list.metricLearners")}
          />
        </div>

        {loadError ? (
          <div role="alert" className="gt-admin-panel grid justify-items-center gap-3 p-10 text-center">
            <TriangleAlert size={26} aria-hidden="true" className="text-[var(--status-error-fg)]" />
            <p className="m-0 font-semibold">{t("admin.training.errors.loadFailed")}</p>
            <AdminButton variant="outline" size="sm" onClick={reload}>
              {t("admin.training.errors.retry")}
            </AdminButton>
          </div>
        ) : loading ? (
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="gt-admin-panel overflow-hidden" aria-hidden="true">
                <div className="gt-skeleton aspect-[16/9] w-full" />
                <div className="grid gap-2 p-4">
                  <div className="gt-skeleton h-4 w-3/4 rounded-[var(--radius-xs)]" />
                  <div className="gt-skeleton h-3 w-full rounded-[var(--radius-xs)]" />
                  <div className="gt-skeleton h-3 w-2/3 rounded-[var(--radius-xs)]" />
                </div>
              </div>
            ))}
            <p className="sr-only" role="status">
              {t("admin.training.list.title")}
            </p>
          </div>
        ) : groups.length === 0 ? (
          <div className="gt-admin-panel">
            <EmptyState
              icon={GraduationCap}
              title={t("admin.training.list.emptyTitle")}
              body={t("admin.training.list.emptyBody")}
              action={
                <AdminButton variant="primary" iconLeft={Plus} onClick={() => navigate("/admin/formations/nouvelle")}>
                  {t("admin.training.list.create")}
                </AdminButton>
              }
            />
          </div>
        ) : (
          <div id="formations-sections" className="grid scroll-mt-[calc(var(--admin-header-h)+16px)] gap-8" aria-label={t("admin.training.list.sections")} role="region">
            {groups.map((group) => (
              <StatusSection key={group.status} status={group.status} courses={group.courses} actions={actions} />
            ))}
          </div>
        )}
      </div>

      <ConfirmationDialog
        open={unpublishing !== null}
        icon={Upload}
        title={t("admin.training.publish.unpublishTitle")}
        body={<p className="m-0">{t("admin.training.publish.unpublishBody")}</p>}
        confirmLabel={t("admin.training.publish.unpublishConfirm")}
        cancelLabel={t("common.cancel")}
        loading={pending}
        onConfirm={async () => {
          if (!unpublishing) return;
          setPending(true);
          try {
            await setCourseStatus(unpublishing.id, "unpublished");
            showToast(
              t("admin.training.toasts.unpublishedTitle"),
              t("admin.training.toasts.unpublishedBody", { name: L(unpublishing.title) }),
              "info",
            );
          } catch (error) {
            const message = trainingErrorMessage(t, error);
            showToast(message.title, message.body, "error");
          } finally {
            setPending(false);
            setUnpublishing(null);
          }
        }}
        onCancel={() => setUnpublishing(null)}
      />

      <ConfirmationDialog
        open={deleting !== null}
        icon={Trash2}
        tone="danger"
        title={t("admin.training.publish.deleteTitle")}
        body={
          <>
            <p className="m-0">
              {t("admin.training.publish.deleteBody", { name: deleting ? L(deleting.title) : "" })}
            </p>
            <p className="m-0 mt-2 font-semibold text-[var(--status-error-fg)]">
              {t("admin.training.publish.deleteWarning")}
            </p>
          </>
        }
        confirmLabel={t("admin.training.publish.deleteConfirm")}
        cancelLabel={t("common.cancel")}
        confirmPhrase={deleting ? L(deleting.title) : undefined}
        loading={pending}
        onConfirm={async () => {
          if (!deleting) return;
          setPending(true);
          try {
            await deleteCourse(deleting.id);
            showToast(
              t("admin.training.toasts.deletedTitle"),
              t("admin.training.toasts.deletedBody", { name: L(deleting.title) }),
              "warning",
            );
          } catch (error) {
            const message = trainingErrorMessage(t, error);
            showToast(message.title, message.body, "error");
          } finally {
            setPending(false);
            setDeleting(null);
          }
        }}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}

/** One status of the catalogue: its name, what it means, and its cards. */
function StatusSection({ status, courses, actions }: { status: CourseStatus; courses: TrainingCourse[]; actions: CourseActions }) {
  const { t } = useTranslation();
  const headingId = `formations-${status}-title`;
  return (
    <section id={`formations-${status}`} aria-labelledby={headingId} className="grid scroll-mt-[calc(var(--admin-header-h)+16px)] gap-3">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 id={headingId} className="m-0 flex items-center gap-2 text-[length:var(--text-h4)]">
          <StatusBadge status={status} size="sm" />
          <span className="text-[length:var(--text-body-sm)] font-semibold tabular-nums text-[var(--text-muted)]">
            {t("admin.training.list.sectionCount", { count: courses.length })}
          </span>
        </h2>
        <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t(`admin.training.statusHelp.${status}`)}</p>
      </header>
      <ul className="m-0 grid list-none gap-4 p-0 md:grid-cols-2 2xl:grid-cols-3">
        {courses.map((course) => (
          <li key={course.id} className="grid min-w-0">
            <CourseCard course={course} actions={actions} />
          </li>
        ))}
      </ul>
    </section>
  );
}
