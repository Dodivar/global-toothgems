import { useTranslation } from "react-i18next";
import { SlidersHorizontal, X } from "lucide-react";
import { AdminButton } from "../AdminButton";
import { AdminSelect } from "../AdminSelect";
import { SearchInput } from "../SearchInput";
import { COURSE_CATEGORIES, COURSE_LEVELS, COURSE_STATUSES } from "../../../data/adminTraining";
import {
  TRAINING_SORT_KEYS,
  isTrainingFiltered,
  type TrainingFilterState,
  type TrainingSortKey,
} from "../../../lib/trainingFilters";

const SORT_LABEL: Record<TrainingSortKey, string> = {
  recent: "sortRecent",
  oldest: "sortOldest",
  "title-asc": "sortTitle",
  "modules-desc": "sortModules",
  "completion-desc": "sortCompletion",
  "enrolled-desc": "sortEnrolled",
};

/**
 * Search, filters and sorting above the training catalogue.
 *
 * Every control is labelled: the selects are narrow enough that a placeholder
 * would be the only clue as to what "All levels" is filtering, and that clue
 * disappears the moment a value is chosen.
 */
export function TrainingToolbar({
  filters,
  onChange,
  resultCount,
  totalCount,
}: {
  filters: TrainingFilterState;
  onChange: (filters: TrainingFilterState) => void;
  resultCount: number;
  totalCount: number;
}) {
  const { t } = useTranslation();
  const filtered = isTrainingFiltered(filters);

  const set = <K extends keyof TrainingFilterState>(key: K, value: TrainingFilterState[K]) =>
    onChange({ ...filters, [key]: value });

  return (
    <div className="gt-admin-panel grid gap-3 p-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_repeat(3,minmax(0,150px))_minmax(0,180px)]">
        <SearchInput
          id="training-search"
          value={filters.search}
          onChange={(search) => set("search", search)}
          label={t("admin.training.list.searchLabel")}
          placeholder={t("admin.training.list.searchPlaceholder")}
          clearLabel={t("admin.training.list.searchClear")}
        />

        <Labelled label={t("admin.training.list.status")} id="training-status">
          <AdminSelect
            id="training-status"
            value={filters.status}
            onChange={(e) => set("status", e.target.value as TrainingFilterState["status"])}
            options={[
              { value: "any", label: t("admin.training.list.allStatuses") },
              ...COURSE_STATUSES.map((s) => ({ value: s, label: t(`admin.training.status.${s}`) })),
            ]}
          />
        </Labelled>

        <Labelled label={t("admin.training.list.category")} id="training-category">
          <AdminSelect
            id="training-category"
            value={filters.category}
            onChange={(e) => set("category", e.target.value as TrainingFilterState["category"])}
            options={[
              { value: "any", label: t("admin.training.list.allCategories") },
              ...COURSE_CATEGORIES.map((c) => ({ value: c, label: t(`admin.training.category.${c}`) })),
            ]}
          />
        </Labelled>

        <Labelled label={t("admin.training.list.level")} id="training-level">
          <AdminSelect
            id="training-level"
            value={filters.level}
            onChange={(e) => set("level", e.target.value as TrainingFilterState["level"])}
            options={[
              { value: "any", label: t("admin.training.list.allLevels") },
              ...COURSE_LEVELS.map((l) => ({ value: l, label: t(`admin.training.level.${l}`) })),
            ]}
          />
        </Labelled>

        <Labelled label={t("admin.training.list.sort")} id="training-sort">
          <AdminSelect
            id="training-sort"
            value={filters.sort}
            onChange={(e) => set("sort", e.target.value as TrainingSortKey)}
            options={TRAINING_SORT_KEYS.map((key) => ({
              value: key,
              label: t(`admin.training.list.${SORT_LABEL[key]}`),
            }))}
          />
        </Labelled>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-subtle)] pt-3">
        <p
          className="m-0 flex items-center gap-1.5 text-[length:var(--text-caption)] text-[var(--text-muted)]"
          role="status"
          aria-live="polite"
        >
          <SlidersHorizontal size={13} strokeWidth={2} aria-hidden="true" />
          {t("admin.training.list.results", { count: resultCount, total: totalCount })}
        </p>

        {filtered && (
          <AdminButton
            variant="ghost"
            size="sm"
            iconLeft={X}
            onClick={() =>
              onChange({ search: "", status: "any", category: "any", level: "any", sort: filters.sort })
            }
          >
            {t("admin.training.list.clearFilters")}
          </AdminButton>
        )}
      </div>
    </div>
  );
}

function Labelled({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="text-[length:var(--text-caption)] font-medium text-[var(--text-muted)]">
        {label}
      </label>
      {children}
    </div>
  );
}
