import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Info } from "lucide-react";
import { AdminSelect } from "./AdminSelect";
import { NumberInput } from "./AdminNumberInputs";
import { ToggleSwitch } from "./ToggleSwitch";
import { fetchInclusionCourses, INCLUSION_MONTHS_MAX, STUDIO_PLAN_IDS, type CourseOption } from "../../lib/productInclusions";
import { isSupabaseConfigured } from "../../lib/supabase/env";
import type { AdminInclusion } from "../../data/adminCatalog";

/**
 * "Included access" of the product form (decision 129): an Academy course and
 * months of a 3D Studio plan opened by one unit of the product — a pack. The
 * database grants them once the order is paid and revokes them on a full
 * refund; a product listing any is sold to an account, one per line.
 */
export function InclusionsEditor({
  inclusions,
  error,
  onChange,
}: {
  inclusions: AdminInclusion[] | undefined;
  error?: string;
  onChange: (inclusions: AdminInclusion[] | undefined) => void;
}) {
  const { t } = useTranslation();
  const [courses, setCourses] = useState<CourseOption[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let live = true;
    fetchInclusionCourses()
      .then((list) => live && setCourses(list))
      .catch(() => live && setLoadFailed(true));
    return () => {
      live = false;
    };
  }, []);

  if (!isSupabaseConfigured) {
    return <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("admin.inclusions.unavailable")}</p>;
  }

  const list = inclusions ?? [];
  const course = list.find((inclusion): inclusion is Extract<AdminInclusion, { kind: "course" }> => inclusion.kind === "course");
  const studio = list.find((inclusion): inclusion is Extract<AdminInclusion, { kind: "studio" }> => inclusion.kind === "studio");
  const write = (nextCourse: typeof course, nextStudio: typeof studio) => {
    const next = [...(nextCourse ? [nextCourse] : []), ...(nextStudio ? [nextStudio] : [])];
    onChange(next.length > 0 ? next : undefined);
  };

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 rounded-[var(--admin-radius-sm)] border border-[var(--border-subtle)] bg-[var(--admin-panel-sunken)] p-4">
        <ToggleSwitch
          label={t("admin.inclusions.courseToggle")}
          description={t("admin.inclusions.courseHint")}
          checked={Boolean(course)}
          disabled={!course && (courses === null || courses.length === 0)}
          onChange={(checked) => write(checked ? { kind: "course", courseId: courses?.[0]?.id ?? "" } : undefined, studio)}
        />
        {course && (
          <AdminSelect
            aria-label={t("admin.inclusions.courseLabel")}
            options={[
              ...(courses ?? []).map((option) => ({
                value: option.id,
                label: option.published ? option.title : t("admin.inclusions.courseDraft", { title: option.title }),
              })),
              ...(courses && !courses.some((option) => option.id === course.courseId)
                ? [{ value: course.courseId, label: t("admin.inclusions.courseUnknown") }]
                : []),
            ]}
            value={course.courseId}
            onChange={(e) => write({ kind: "course", courseId: e.target.value }, studio)}
          />
        )}
        {loadFailed && <p className="m-0 text-[length:var(--text-caption)] text-[var(--status-error-fg)]">{t("admin.inclusions.loadError")}</p>}
      </div>

      <div className="grid gap-3 rounded-[var(--admin-radius-sm)] border border-[var(--border-subtle)] bg-[var(--admin-panel-sunken)] p-4">
        <ToggleSwitch
          label={t("admin.inclusions.studioToggle")}
          description={t("admin.inclusions.studioHint")}
          checked={Boolean(studio)}
          onChange={(checked) => write(course, checked ? { kind: "studio", plan: "artist", months: 3 } : undefined)}
        />
        {studio && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-[length:var(--text-caption)] text-[var(--text-muted)]">
              {t("admin.inclusions.planLabel")}
              <AdminSelect
                options={STUDIO_PLAN_IDS.map((plan) => ({ value: plan, label: t(`product.pack.plan.${plan}`) }))}
                value={studio.plan}
                onChange={(e) => write(course, { ...studio, plan: e.target.value as (typeof STUDIO_PLAN_IDS)[number] })}
              />
            </label>
            <label className="grid gap-1 text-[length:var(--text-caption)] text-[var(--text-muted)]">
              {t("admin.inclusions.monthsLabel", { max: INCLUSION_MONTHS_MAX })}
              <NumberInput
                value={studio.months}
                min={1}
                onValueChange={(value) => write(course, { ...studio, months: value ?? 0 })}
              />
            </label>
          </div>
        )}
      </div>

      {list.length > 0 && (
        <p className="m-0 flex items-start gap-2 rounded-[var(--admin-radius-sm)] bg-[var(--status-info-bg)] p-3 text-[length:var(--text-body-sm)] text-[var(--gt-blue-700)]">
          <Info size={14} aria-hidden="true" className="mt-0.5 flex-none" />
          {t("admin.inclusions.rules")}
        </p>
      )}
      {error && (
        <p role="alert" className="m-0 text-[length:var(--text-body-sm)] font-medium text-[var(--status-error-fg)]">
          {error}
        </p>
      )}
    </div>
  );
}
