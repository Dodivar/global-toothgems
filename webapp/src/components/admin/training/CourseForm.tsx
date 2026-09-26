import { useTranslation } from "react-i18next";
import { Award, BookOpen, GraduationCap, ImageIcon, Target } from "lucide-react";
import clsx from "clsx";
import { AdminSelect } from "../AdminSelect";
import { FormField } from "../FormField";
import { ToggleSwitch } from "../ToggleSwitch";
import { ObjectiveList } from "./ObjectiveList";
import { LangSwitch, MetaPill, Section, StatusBadge } from "./TrainingPrimitives";
import {
  COURSE_CATEGORIES,
  COURSE_LEVELS,
  COVER_LIBRARY,
  INSTRUCTORS,
  getInstructor,
  type TrainingCourse,
} from "../../../data/adminTraining";
import { formatDuration } from "../../../lib/trainingFilters";
import { useLocalized, type ContentLang } from "../../../lib/localized";

/**
 * Course information: everything about a training that is not its structure.
 *
 * Controlled from outside so the same form serves the creation page, where the
 * draft is local until it is submitted, and the builder, where every keystroke
 * goes straight into the store. The split the brief asks for — information here,
 * structure in the builder — is enforced by this component holding no structural
 * field at all.
 */
export function CourseForm({
  draft,
  onChange,
  lang,
  onLangChange,
  errors,
  showPreview = true,
}: {
  draft: TrainingCourse;
  onChange: (patch: Partial<TrainingCourse>) => void;
  lang: ContentLang;
  onLangChange: (lang: ContentLang) => void;
  errors?: { title?: string; shortDescription?: string };
  showPreview?: boolean;
}) {
  const { t, i18n } = useTranslation();

  return (
    <div className={clsx("grid items-start gap-4", showPreview && "xl:grid-cols-[minmax(0,1fr)_340px]")}>
      <div className="grid min-w-0 gap-4">
        <Section
          title={t("admin.training.create.sectionInfo")}
          description={t("admin.training.create.sectionInfoHint")}
          icon={BookOpen}
          aside={<LangSwitch lang={lang} onChange={onLangChange} probe={draft.title} />}
        >
          <div className="grid gap-4">
            <FormField
              label={t("admin.training.create.fieldTitle")}
              hint={t("admin.training.create.fieldTitleHint")}
              required
              error={errors?.title}
            >
              {(props) => (
                <input
                  {...props}
                  type="text"
                  className="gt-admin-field"
                  placeholder={t("admin.training.create.fieldTitlePlaceholder")}
                  value={draft.title[lang]}
                  onChange={(e) => onChange({ title: { ...draft.title, [lang]: e.target.value } })}
                />
              )}
            </FormField>

            <FormField
              label={t("admin.training.create.fieldShort")}
              hint={t("admin.training.create.fieldShortHint")}
              required
              error={errors?.shortDescription}
            >
              {(props) => (
                <input
                  {...props}
                  type="text"
                  className="gt-admin-field"
                  placeholder={t("admin.training.create.fieldShortPlaceholder")}
                  value={draft.shortDescription[lang]}
                  onChange={(e) =>
                    onChange({ shortDescription: { ...draft.shortDescription, [lang]: e.target.value } })
                  }
                />
              )}
            </FormField>

            <FormField label={t("admin.training.create.fieldFull")} hint={t("admin.training.create.fieldFullHint")}>
              {(props) => (
                <textarea
                  {...props}
                  rows={5}
                  className="gt-admin-field"
                  placeholder={t("admin.training.create.fieldFullPlaceholder")}
                  value={draft.fullDescription[lang]}
                  onChange={(e) =>
                    onChange({ fullDescription: { ...draft.fullDescription, [lang]: e.target.value } })
                  }
                />
              )}
            </FormField>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <FormField label={t("admin.training.create.fieldCategory")}>
                {(props) => (
                  <AdminSelect
                    {...props}
                    value={draft.category}
                    onChange={(e) => onChange({ category: e.target.value as TrainingCourse["category"] })}
                    options={COURSE_CATEGORIES.map((c) => ({
                      value: c,
                      label: t(`admin.training.category.${c}`),
                    }))}
                  />
                )}
              </FormField>

              <FormField label={t("admin.training.create.fieldLevel")}>
                {(props) => (
                  <AdminSelect
                    {...props}
                    value={draft.level}
                    onChange={(e) => onChange({ level: e.target.value as TrainingCourse["level"] })}
                    options={COURSE_LEVELS.map((l) => ({ value: l, label: t(`admin.training.level.${l}`) }))}
                  />
                )}
              </FormField>

              <FormField
                label={t("admin.training.create.fieldDuration")}
                hint={t("admin.training.create.fieldDurationHint")}
              >
                {(props) => (
                  <input
                    {...props}
                    type="number"
                    min={0}
                    max={1200}
                    className="gt-admin-field tabular-nums"
                    value={draft.duration}
                    onChange={(e) => onChange({ duration: Number(e.target.value) || 0 })}
                  />
                )}
              </FormField>

              <FormField label={t("admin.training.create.fieldInstructor")}>
                {(props) => (
                  <AdminSelect
                    {...props}
                    value={draft.instructorId}
                    onChange={(e) => onChange({ instructorId: e.target.value })}
                    options={INSTRUCTORS.map((i) => ({ value: i.id, label: i.name }))}
                  />
                )}
              </FormField>
            </div>
          </div>
        </Section>

        <Section
          title={t("admin.training.create.sectionMedia")}
          description={t("admin.training.create.sectionMediaHint")}
          icon={ImageIcon}
        >
          <fieldset className="m-0 grid gap-3 border-0 p-0">
            <legend className="sr-only">{t("admin.training.create.fieldCover")}</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {COVER_LIBRARY.map((src, index) => {
                const selected = src === draft.cover;
                return (
                  <label
                    key={src}
                    className={clsx(
                      "relative block cursor-pointer overflow-hidden rounded-[var(--admin-radius-sm)] border-2 transition-colors",
                      "focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--focus-ring)]",
                      selected ? "border-[var(--gt-emerald-500)]" : "border-transparent hover:border-[var(--gt-ink-400)]",
                    )}
                  >
                    <input
                      type="radio"
                      name="course-cover"
                      checked={selected}
                      onChange={() => onChange({ cover: src })}
                      className="sr-only"
                    />
                    <span className="sr-only">{`${t("admin.training.create.coverOption")} ${index + 1}`}</span>
                    <img src={src} alt="" aria-hidden="true" className="aspect-[16/10] w-full object-cover" />
                  </label>
                );
              })}
            </div>
            <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">
              {t("admin.training.create.fieldCoverHint")}
            </p>
          </fieldset>
        </Section>

        <Section
          title={t("admin.training.create.sectionGoals")}
          description={t("admin.training.create.sectionGoalsHint")}
          icon={Target}
        >
          <div className="grid gap-5">
            <ObjectiveList
              items={draft.objectives}
              lang={lang}
              onChange={(objectives) => onChange({ objectives })}
              label={t("admin.training.create.objectives")}
              hint={t("admin.training.create.objectivesHint")}
              addLabel={t("admin.training.create.objectiveAdd")}
              placeholder={t("admin.training.create.objectivePlaceholder")}
              removeLabel={t("admin.training.create.objectiveRemove")}
            />

            <ObjectiveList
              items={draft.requirements}
              lang={lang}
              onChange={(requirements) => onChange({ requirements })}
              label={t("admin.training.create.requirements")}
              hint={t("admin.training.create.requirementsHint")}
              addLabel={t("admin.training.create.requirementAdd")}
              placeholder={t("admin.training.create.requirementPlaceholder")}
              removeLabel={t("admin.training.create.requirementRemove")}
              emptyLabel={t("admin.training.create.requirementsHint")}
            />
          </div>
        </Section>

        <Section
          title={t("admin.training.create.sectionRules")}
          description={t("admin.training.create.sectionRulesHint")}
          icon={Award}
        >
          <div className="grid gap-4">
            <ToggleSwitch
              label={t("admin.training.create.completionAllSteps")}
              description={t("admin.training.create.completionAllStepsHint")}
              checked={draft.completion.allSteps}
              onChange={(allSteps) => onChange({ completion: { ...draft.completion, allSteps } })}
            />
            <ToggleSwitch
              label={t("admin.training.create.completionAllQuizzes")}
              description={t("admin.training.create.completionAllQuizzesHint")}
              checked={draft.completion.allQuizzes}
              onChange={(allQuizzes) => onChange({ completion: { ...draft.completion, allQuizzes } })}
            />

            {draft.completion.allQuizzes && (
              <FormField
                label={t("admin.training.create.completionMinScore")}
                hint={t("admin.training.create.completionMinScoreHint")}
              >
                {(props) => (
                  <div className="flex items-center gap-3">
                    <input
                      {...props}
                      type="range"
                      min={40}
                      max={100}
                      step={5}
                      value={draft.completion.minScore}
                      onChange={(e) =>
                        onChange({ completion: { ...draft.completion, minScore: Number(e.target.value) } })
                      }
                      className="w-full accent-[var(--gt-emerald-500)]"
                    />
                    <span className="w-12 flex-none text-right text-[length:var(--text-body-sm)] font-bold tabular-nums">
                      {draft.completion.minScore} %
                    </span>
                  </div>
                )}
              </FormField>
            )}

            <ToggleSwitch
              label={t("admin.training.create.completionCertificate")}
              description={t("admin.training.create.completionCertificateHint")}
              checked={draft.completion.certificate}
              onChange={(certificate) => onChange({ completion: { ...draft.completion, certificate } })}
            />
          </div>
        </Section>
      </div>

      {showPreview && <CoursePreviewCard draft={draft} lang={lang} language={i18n.language} />}
    </div>
  );
}

/**
 * How the course will look in the Academy catalogue.
 *
 * Sticky beside the form rather than behind a "Preview" button: the brief asks
 * for a prominent preview, and a preview you have to ask for is one nobody
 * looks at while typing the title it is showing.
 */
function CoursePreviewCard({
  draft,
  lang,
  language,
}: {
  draft: TrainingCourse;
  lang: ContentLang;
  language: string;
}) {
  const { t } = useTranslation();
  const L = useLocalized();
  const instructor = getInstructor(draft.instructorId);
  const empty = draft.title[lang].trim() === "" && draft.shortDescription[lang].trim() === "";

  return (
    <aside className="grid gap-2 xl:sticky xl:top-[calc(var(--admin-header-h)+20px)]">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[length:var(--text-body-sm)] font-semibold">{t("admin.training.create.previewTitle")}</h2>
        <StatusBadge status={draft.status} size="sm" />
      </div>
      <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">
        {t("admin.training.create.previewHint")}
      </p>

      <div className="gt-admin-panel overflow-hidden">
        <img src={draft.cover} alt="" aria-hidden="true" className="aspect-[16/10] w-full object-cover" />
        <div className="grid gap-2.5 p-4">
          {empty ? (
            <div className="grid gap-1 py-4 text-center">
              <GraduationCap
                size={20}
                strokeWidth={1.8}
                aria-hidden="true"
                className="mx-auto text-[var(--text-subtle)]"
              />
              <p className="m-0 text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">
                {t("admin.training.create.previewEmptyTitle")}
              </p>
              <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">
                {t("admin.training.create.previewEmptyBody")}
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-1.5">
                <MetaPill>{t(`admin.training.level.${draft.level}`)}</MetaPill>
                <MetaPill>{t(`admin.training.category.${draft.category}`)}</MetaPill>
                {draft.duration > 0 && <MetaPill>{formatDuration(draft.duration, language)}</MetaPill>}
              </div>

              <h3 className="text-[length:var(--text-h4)]">{draft.title[lang]}</h3>
              <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
                {draft.shortDescription[lang]}
              </p>

              {instructor && (
                <p className="m-0 flex items-center gap-2 border-t border-[var(--border-subtle)] pt-2.5 text-[length:var(--text-caption)] text-[var(--text-muted)]">
                  <span
                    aria-hidden="true"
                    className="grid h-7 w-7 flex-none place-items-center rounded-full bg-[var(--surface-brand)] text-[10px] font-bold text-[var(--gt-ink-900)]"
                  >
                    {instructor.initials}
                  </span>
                  <span className="grid leading-tight">
                    <strong className="font-semibold text-[var(--text-primary)]">{instructor.name}</strong>
                    <span>{L(instructor.role)}</span>
                  </span>
                </p>
              )}

              {draft.objectives.length > 0 && (
                <ul className="m-0 grid list-none gap-1 border-t border-[var(--border-subtle)] p-0 pt-2.5">
                  {draft.objectives.slice(0, 3).map((objective, index) => (
                    <li
                      key={index}
                      className="flex items-start gap-1.5 text-[length:var(--text-caption)] text-[var(--text-body)]"
                    >
                      <Target
                        size={12}
                        strokeWidth={2}
                        aria-hidden="true"
                        className="mt-0.5 flex-none text-[var(--accent-cta-ink)]"
                      />
                      {objective[lang]}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
