"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "../../lib/navigation";
import { GraduationCap, Images, Plus, Trash2, TriangleAlert, Upload } from "lucide-react";
import { AdminButton } from "../../components/admin/AdminButton";
import { AdminHeader } from "../../components/admin/AdminHeader";
import { ConfirmationDialog } from "../../components/admin/ConfirmationDialog";
import { EmptyState } from "../../components/admin/EmptyState";
import { StatCard } from "../../components/admin/StatCard";
import { CourseCard, type CourseActions } from "../../components/admin/training/CourseCard";
import { TrainingToolbar } from "../../components/admin/training/TrainingToolbar";
import { trainingErrorMessage } from "../../components/admin/training/trainingErrors";
import { MEDIA_LIBRARY_PATH } from "../../components/admin/training/MediaPickerDialog";
import { useAdminTraining } from "../../lib/adminTraining";
import { useLocalized } from "../../lib/localized";
import { useToast } from "../../lib/toast";
import {
  DEFAULT_TRAINING_FILTERS,
  TRAINING_SORT_KEYS,
  filterCourses,
  isTrainingFiltered,
  type TrainingFilterState,
  type TrainingSortKey,
} from "../../lib/trainingFilters";
import type { CourseCategory, CourseLevel, CourseStatus, TrainingCourse } from "../../data/adminTraining";
import { useAdminShell } from "./AdminLayout";

/**
 * The training catalogue.
 *
 * Same shape as the product list, and deliberately so: filters travel in the
 * query string, the page owns every consequence, and the cards stay
 * presentational. What differs is the unit — a course is a hierarchy, not a
 * row — so the list is a grid of cards that each show their own structure.
 */
export function Training() {
  const { t, i18n } = useTranslation();
  const L = useLocalized();
  const navigate = useNavigate();
  const { openNav } = useAdminShell();
  const { showToast } = useToast();
  const { courses, loading, loadError, reload, duplicateCourse, deleteCourse, setCourseStatus } = useAdminTraining();

  const [params, setParams] = useSearchParams();
  const [deleting, setDeleting] = useState<TrainingCourse | null>(null);
  const [unpublishing, setUnpublishing] = useState<TrainingCourse | null>(null);
  const [pending, setPending] = useState(false);

  const filters = useMemo<TrainingFilterState>(
    () => ({
      search: params.get("q") ?? "",
      status: (params.get("statut") as CourseStatus | null) ?? "any",
      category: (params.get("categorie") as CourseCategory | null) ?? "any",
      level: (params.get("niveau") as CourseLevel | null) ?? "any",
      sort: TRAINING_SORT_KEYS.includes(params.get("tri") as TrainingSortKey)
        ? (params.get("tri") as TrainingSortKey)
        : "recent",
    }),
    [params],
  );

  const setFilters = (next: TrainingFilterState) => {
    const search = new URLSearchParams();
    if (next.search.trim()) search.set("q", next.search);
    if (next.status !== "any") search.set("statut", next.status);
    if (next.category !== "any") search.set("categorie", next.category);
    if (next.level !== "any") search.set("niveau", next.level);
    if (next.sort !== "recent") search.set("tri", next.sort);
    // Replace, not push: typing in the search box must not fill the history.
    setParams(search, { replace: true });
  };

  const visible = useMemo(() => filterCourses(courses, filters, i18n.language), [courses, filters, i18n.language]);

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

  const filtered = isTrainingFiltered(filters);

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
            to="/admin/formations"
            linkLabel={t("admin.training.list.metricTotal")}
          />
          <StatCard
            label={t("admin.training.list.metricPublished")}
            value={stats.published}
            hint={t("admin.training.statusHelp.published")}
            icon={Upload}
            tone="success"
            to="/admin/formations?statut=published"
            linkLabel={t("admin.training.list.metricPublished")}
          />
          <StatCard
            label={t("admin.training.list.metricDrafts")}
            value={stats.drafts}
            hint={t("admin.training.statusHelp.draft")}
            icon={Plus}
            tone="warning"
            to="/admin/formations?statut=draft"
            linkLabel={t("admin.training.list.metricDrafts")}
          />
          <StatCard
            label={t("admin.training.list.metricLearners")}
            value={stats.learners}
            hint={t("admin.training.list.completion")}
            icon={GraduationCap}
            to="/admin/formations?tri=enrolled-desc"
            linkLabel={t("admin.training.list.metricLearners")}
          />
        </div>

        <TrainingToolbar
          filters={filters}
          onChange={setFilters}
          resultCount={visible.length}
          totalCount={courses.length}
        />

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
        ) : visible.length === 0 ? (
          <div className="gt-admin-panel">
            <EmptyState
              icon={GraduationCap}
              title={filtered ? t("admin.training.list.emptyFilteredTitle") : t("admin.training.list.emptyTitle")}
              body={filtered ? t("admin.training.list.emptyFilteredBody") : t("admin.training.list.emptyBody")}
              action={
                filtered ? (
                  <AdminButton variant="outline" onClick={() => setFilters(DEFAULT_TRAINING_FILTERS)}>
                    {t("admin.training.list.clearFilters")}
                  </AdminButton>
                ) : (
                  <AdminButton
                    variant="primary"
                    iconLeft={Plus}
                    onClick={() => navigate("/admin/formations/nouvelle")}
                  >
                    {t("admin.training.list.create")}
                  </AdminButton>
                )
              }
            />
          </div>
        ) : (
          <ul className="m-0 grid list-none gap-4 p-0 md:grid-cols-2 2xl:grid-cols-3">
            {visible.map((course) => (
              <li key={course.id} className="grid">
                <CourseCard course={course} actions={actions} />
              </li>
            ))}
          </ul>
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
