import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { CircleCheck, Eye, GraduationCap, Layers, PanelRight, Save, Trash2, X } from "lucide-react";
import clsx from "clsx";
import { AdminButton } from "../../components/admin/AdminButton";
import { AdminHeader } from "../../components/admin/AdminHeader";
import { ConfirmationDialog } from "../../components/admin/ConfirmationDialog";
import { EmptyState } from "../../components/admin/EmptyState";
import { CourseForm } from "../../components/admin/training/CourseForm";
import { ModuleEditor } from "../../components/admin/training/ModuleEditor";
import { PropertiesPanel } from "../../components/admin/training/PropertiesPanel";
import { QuizBuilder } from "../../components/admin/training/QuizBuilder";
import { StepEditor } from "../../components/admin/training/StepEditor";
import { StructureTree, type TreeActions } from "../../components/admin/training/StructureTree";
import { LangSwitch, SaveIndicator } from "../../components/admin/training/TrainingPrimitives";
import { useAdminTraining } from "../../lib/adminTraining";
import { useToast } from "../../lib/toast";
import { useFocusTrap } from "../../lib/useFocusTrap";
import { useLocalized, type ContentLang } from "../../lib/localized";
import { readSelection, resolveSelection, writeSelection, type Selection } from "../../lib/trainingSelection";
import type { Module } from "../../data/adminTraining";
import { useAdminShell } from "./AdminLayout";

/**
 * The course builder: structure on the left, the selected thing in the middle,
 * its properties on the right.
 *
 * The three panels only coexist above `xl`. Below that the layout changes
 * rather than shrinking: at `md` the properties panel becomes a drawer, and
 * below `md` the structure and the editor become two views with a tab switch,
 * because a 280px tree beside a block editor on a 600px screen leaves neither
 * usable. A phone is not the place to write a course, but it is a perfectly
 * normal place to check one.
 *
 * The selection lives in the query string, so Back walks the tree and a step
 * can be linked to.
 */
export function TrainingBuilder() {
  const { t, i18n } = useTranslation();
  const L = useLocalized();
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { openNav } = useAdminShell();
  const { showToast } = useToast();
  const training = useAdminTraining();
  const {
    getCourse,
    updateCourse,
    saveDraft,
    dirty,
    saving,
    lastSavedAt,
    addModule,
    addStep,
    addQuiz,
    duplicateModule,
    deleteModule,
    moveModule,
    duplicateStep,
    deleteStep,
    moveStep,
    updateModule,
  } = training;

  const [params, setParams] = useSearchParams();
  const [lang, setLang] = useState<ContentLang>(() => (i18n.language.startsWith("en") ? "en" : "fr"));
  const [mobileView, setMobileView] = useState<"structure" | "editor">("structure");
  const [propsOpen, setPropsOpen] = useState(false);
  const [removingModule, setRemovingModule] = useState<Module | null>(null);

  const closeProps = useCallback(() => setPropsOpen(false), []);
  const drawerRef = useFocusTrap<HTMLDivElement>(propsOpen, closeProps);

  const course = getCourse(id);

  const selection = useMemo<Selection>(
    () => (course ? resolveSelection(course, readSelection(params)) : { kind: "course" }),
    [course, params],
  );

  const select = useCallback(
    (next: Selection) => {
      setParams(writeSelection(next));
      // On a phone the two panels are two views, so choosing something in the
      // structure has to move the administrator to what they chose.
      if (next.kind !== "course") setMobileView("editor");
    },
    [setParams],
  );

  if (!course) return <Navigate to="/admin/formations" replace />;

  const title = L(course.title) || t("admin.training.create.fieldTitlePlaceholder");

  const treeActions: TreeActions = {
    onSelect: select,
    onAddModule: () => {
      const moduleId = addModule(course.id);
      if (moduleId) select({ kind: "module", moduleId });
      showToast(t("admin.training.toasts.moduleAddedTitle"), t("admin.training.toasts.moduleAddedBody"));
    },
    onAddStep: (moduleId) => {
      const stepId = addStep(course.id, moduleId);
      if (stepId) select({ kind: "step", moduleId, stepId });
      showToast(t("admin.training.toasts.stepAddedTitle"), t("admin.training.toasts.stepAddedBody"));
    },
    onAddQuiz: (moduleId) => {
      addQuiz(course.id, moduleId);
      select({ kind: "quiz", moduleId });
      showToast(t("admin.training.toasts.quizAddedTitle"), t("admin.training.toasts.quizAddedBody"));
    },
    onDuplicateModule: (moduleId) => {
      const copyId = duplicateModule(course.id, moduleId);
      if (copyId) select({ kind: "module", moduleId: copyId });
      showToast(t("admin.training.toasts.moduleDuplicatedTitle"));
    },
    onDeleteModule: (module) => setRemovingModule(module),
    onMoveModule: (moduleId, to) => moveModule(course.id, moduleId, to),
    onDuplicateStep: (moduleId, stepId) => {
      const copyId = duplicateStep(course.id, moduleId, stepId);
      if (copyId) select({ kind: "step", moduleId, stepId: copyId });
      showToast(t("admin.training.toasts.stepDuplicatedTitle"));
    },
    onDeleteStep: (moduleId, stepId) => {
      deleteStep(course.id, moduleId, stepId);
      showToast(t("admin.training.toasts.stepDeletedTitle"), undefined, "info");
    },
    onMoveStep: (moduleId, stepId, to) => moveStep(course.id, moduleId, stepId, to),
    onRenameModule: (moduleId, next) => {
      const module = course.modules.find((m) => m.id === moduleId);
      if (module) updateModule(course.id, moduleId, { title: { ...module.title, [lang]: next } });
    },
  };

  const previewPath = (extra?: URLSearchParams) =>
    `/admin/formations/${course.id}/apercu${extra && extra.toString() ? `?${extra}` : ""}`;

  const save = async () => {
    await saveDraft(course.id);
    showToast(t("admin.training.toasts.savedTitle"), t("admin.training.toasts.savedBody"));
  };

  return (
    <>
      <AdminHeader
        title={title}
        description={t("admin.training.builder.description")}
        crumbs={[
          { label: t("admin.nav.dashboard"), to: "/admin" },
          { label: t("admin.nav.training"), to: "/admin/formations" },
          { label: t("admin.training.builder.title") },
        ]}
        onOpenNav={openNav}
        actions={
          <>
            <AdminButton variant="outline" iconLeft={Eye} onClick={() => navigate(previewPath())}>
              <span className="hidden xl:inline">{t("admin.training.actions.preview")}</span>
            </AdminButton>
            <AdminButton variant="outline" iconLeft={Save} loading={saving} onClick={save}>
              <span className="hidden xl:inline">{t("admin.training.save.saveDraft")}</span>
            </AdminButton>
            <AdminButton
              variant="primary"
              iconLeft={CircleCheck}
              onClick={() => navigate(`/admin/formations/${course.id}/publication`)}
            >
              <span className="hidden lg:inline">{t("admin.training.builder.reviewAndPublish")}</span>
              <span className="lg:hidden">{t("admin.training.actions.publish")}</span>
            </AdminButton>
          </>
        }
      />

      {/* The workspace bar: save state and authoring language at every width,
          plus the two controls the narrower layouts need — the structure/editor
          tab switch, and the button that opens the properties drawer. */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border-subtle)] bg-[var(--admin-panel)] px-[var(--admin-gutter)] py-2">
        <div
          role="tablist"
          aria-label={t("admin.training.builder.structure")}
          className="flex gap-0.5 rounded-[var(--radius-pill)] bg-[var(--surface-sunken)] p-0.5 md:hidden"
        >
          {(["structure", "editor"] as const).map((view) => (
            <button
              key={view}
              type="button"
              role="tab"
              aria-selected={mobileView === view}
              onClick={() => setMobileView(view)}
              className={clsx(
                "rounded-[var(--radius-pill)] px-3 py-1.5 text-[length:var(--text-caption)] font-semibold transition-colors",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--focus-ring)]",
                mobileView === view
                  ? "bg-[var(--gt-ink-900)] text-[var(--text-inverse)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]",
              )}
            >
              {t(view === "structure" ? "admin.training.builder.tabStructure" : "admin.training.builder.tabEditor")}
            </button>
          ))}
        </div>

        <SaveIndicator dirty={dirty} saving={saving} lastSavedAt={lastSavedAt} />

        <span className="flex-1" />

        <LangSwitch lang={lang} onChange={setLang} probe={course.title} />

        <AdminButton
          variant="outline"
          size="sm"
          iconLeft={PanelRight}
          onClick={() => setPropsOpen(true)}
          className="xl:hidden"
        >
          <span className="hidden sm:inline">{t("admin.training.builder.properties")}</span>
        </AdminButton>
      </div>

      <div className="grid gap-4 px-[var(--admin-gutter)] pb-[clamp(32px,5vw,56px)] pt-4 md:grid-cols-[minmax(240px,280px)_minmax(0,1fr)] xl:grid-cols-[minmax(260px,300px)_minmax(0,1fr)_330px]">
        {/* Structure */}
        <aside
          aria-label={t("admin.training.builder.treeLabel")}
          className={clsx(
            "gt-admin-panel h-fit max-h-[calc(100vh-var(--admin-header-h)-120px)] overflow-hidden p-3 md:sticky md:top-[calc(var(--admin-header-h)+16px)]",
            mobileView === "structure" ? "block" : "hidden md:block",
          )}
        >
          <StructureTree course={course} selection={selection} actions={treeActions} lang={i18n.language} />
        </aside>

        {/* Editor */}
        <div className={clsx("min-w-0", mobileView === "editor" ? "block" : "hidden md:block")}>
          <EditorPanel
            course={course}
            selection={selection}
            lang={lang}
            onSelect={select}
            onChangeCourse={(patch) => updateCourse(course.id, patch)}
            onLangChange={setLang}
            previewPath={previewPath}
          />
        </div>

        {/* Properties — inline only where all three panels fit. */}
        <aside
          aria-label={t("admin.training.builder.properties")}
          className="gt-admin-panel hidden h-fit p-4 xl:sticky xl:top-[calc(var(--admin-header-h)+16px)] xl:block"
        >
          <PropertiesPanel course={course} selection={selection} lang={lang} />
        </aside>
      </div>

      {/* Below xl the same panel is a drawer, using the shell's dialog pattern. */}
      {propsOpen && (
        <div className="fixed inset-0 z-[300] xl:hidden">
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={closeProps}
            className="gt-admin-scrim absolute inset-0 cursor-default bg-[rgba(17,17,17,.42)]"
          />
          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label={t("admin.training.builder.properties")}
            tabIndex={-1}
            className="gt-admin-drawer absolute inset-y-0 right-0 flex w-[min(360px,90vw)] flex-col bg-[var(--admin-panel)]"
          >
            <div className="flex flex-none items-center justify-between gap-3 border-b border-[var(--border-subtle)] p-4">
              <h2 className="text-[length:var(--text-h4)]">{t("admin.training.builder.properties")}</h2>
              <button
                type="button"
                onClick={closeProps}
                aria-label={t("admin.training.builder.closeProperties")}
                className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-xs)] text-[var(--text-muted)] transition-colors hover:bg-[var(--gt-ink-100)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
              >
                <X size={16} strokeWidth={2} aria-hidden="true" />
              </button>
            </div>
            <div className="gt-admin-scroll flex-1 overflow-y-auto p-4">
              <PropertiesPanel course={course} selection={selection} lang={lang} />
            </div>
          </div>
        </div>
      )}

      <ConfirmationDialog
        open={removingModule !== null}
        icon={Trash2}
        tone="danger"
        title={t("admin.training.module.deleteTitle")}
        body={
          <>
            <p className="m-0">
              {t("admin.training.module.deleteBody", { name: removingModule ? removingModule.title[lang] : "" })}
            </p>
            <p className="m-0 mt-2 font-semibold text-[var(--status-error-fg)]">
              {t("admin.training.module.deleteWarning")}
            </p>
          </>
        }
        confirmLabel={t("admin.training.actions.delete")}
        cancelLabel={t("common.cancel")}
        onConfirm={() => {
          if (!removingModule) return;
          deleteModule(course.id, removingModule.id);
          setRemovingModule(null);
          select({ kind: "course" });
          showToast(t("admin.training.toasts.moduleDeletedTitle"), undefined, "info");
        }}
        onCancel={() => setRemovingModule(null)}
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */

/** Chooses the centre panel for the current selection. */
function EditorPanel({
  course,
  selection,
  lang,
  onSelect,
  onChangeCourse,
  onLangChange,
  previewPath,
}: {
  course: ReturnType<typeof useAdminTraining>["courses"][number];
  selection: Selection;
  lang: ContentLang;
  onSelect: (selection: Selection) => void;
  onChangeCourse: (patch: Partial<typeof course>) => void;
  onLangChange: (lang: ContentLang) => void;
  previewPath: (extra?: URLSearchParams) => string;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  if (selection.kind === "course") {
    if (course.modules.length === 0) {
      return (
        <div className="grid gap-4">
          <div className="gt-admin-panel">
            <EmptyState
              icon={Layers}
              title={t("admin.training.builder.emptyTitle")}
              body={t("admin.training.builder.emptyBody")}
            />
          </div>
          <CourseForm
            draft={course}
            onChange={onChangeCourse}
            lang={lang}
            onLangChange={onLangChange}
            showPreview={false}
          />
        </div>
      );
    }
    return (
      <CourseForm
        draft={course}
        onChange={onChangeCourse}
        lang={lang}
        onLangChange={onLangChange}
        showPreview={false}
      />
    );
  }

  const module = course.modules.find((m) => m.id === selection.moduleId);
  if (!module) {
    return (
      <div className="gt-admin-panel">
        <EmptyState
          icon={GraduationCap}
          title={t("admin.training.builder.nothingTitle")}
          body={t("admin.training.builder.nothingBody")}
        />
      </div>
    );
  }

  const index = course.modules.findIndex((m) => m.id === module.id);

  if (selection.kind === "quiz") {
    if (!module.quiz) return null;
    // Keyed on the quiz: the editor keeps "which question is open" in state, and
    // without a remount that id survives a move to another module's quiz, where
    // it matches nothing and leaves every question collapsed.
    return (
      <QuizBuilder key={module.quiz.id} courseId={course.id} module={module} quiz={module.quiz} lang={lang} />
    );
  }

  if (selection.kind === "step") {
    const step = module.steps.find((s) => s.id === selection.stepId);
    if (!step) return null;
    return (
      <StepEditor
        // Same reasoning as the quiz: the open block and any pending delete
        // dialog belong to the step being edited, not to the panel.
        key={step.id}
        courseId={course.id}
        module={module}
        step={step}
        lang={lang}
        onPreview={() => {
          const extra = new URLSearchParams({ module: module.id, etape: step.id });
          navigate(previewPath(extra));
        }}
      />
    );
  }

  return (
    <ModuleEditor
      courseId={course.id}
      module={module}
      index={index}
      total={course.modules.length}
      lang={lang}
      onSelect={onSelect}
      onPreview={() => navigate(previewPath(new URLSearchParams({ module: module.id })))}
    />
  );
}
