import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  FileText,
  GraduationCap,
  GripVertical,
  ListChecks,
  MoveDown,
  MoveUp,
  Plus,
  Trash2,
} from "lucide-react";
import clsx from "clsx";
import { AdminButton } from "../AdminButton";
import { OverflowMenu, type MenuAction } from "../OverflowMenu";
import { EmptyState } from "../EmptyState";
import { moduleDuration, type Module, type TrainingCourse } from "../../../data/adminTraining";
import { useLocalized } from "../../../lib/localized";
import { dragClasses, useDragReorder } from "../../../lib/useDragReorder";
import type { Selection } from "../../../lib/trainingSelection";
import { formatDuration } from "../../../lib/trainingFilters";

/**
 * The course structure, and the answer to "where am I".
 *
 * Three levels are drawn at three indents with three different markers: the
 * course at the top, its modules, and inside each module its steps followed by
 * its knowledge check. The quiz is always drawn last inside its module, whether
 * it exists or not, because its position in the learner's path is what the
 * administrator is reasoning about — a module that ends without a check should
 * look like a module that ends without a check.
 *
 * Reordering is offered twice over. Rows are draggable, and every row also
 * carries Move up and Move down buttons: HTML5 drag and drop cannot be operated
 * from a keyboard, so drag alone would put the structure out of reach of anyone
 * not using a mouse.
 */

export interface TreeActions {
  onSelect: (selection: Selection) => void;
  onAddModule: () => void;
  onAddStep: (moduleId: string) => void;
  onAddQuiz: (moduleId: string) => void;
  onDuplicateModule: (moduleId: string) => void;
  onDeleteModule: (module: Module) => void;
  onMoveModule: (moduleId: string, to: number | "up" | "down") => void;
  onDuplicateStep: (moduleId: string, stepId: string) => void;
  onDeleteStep: (moduleId: string, stepId: string) => void;
  onMoveStep: (moduleId: string, stepId: string, to: number | "up" | "down") => void;
  onRenameModule: (moduleId: string, title: string) => void;
}

const rowBase =
  "group/row relative flex w-full items-center gap-2 rounded-[var(--admin-radius-sm)] py-2 pr-1 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus-ring)]";

export function StructureTree({
  course,
  selection,
  actions,
  lang,
}: {
  course: TrainingCourse;
  selection: Selection;
  actions: TreeActions;
  lang: string;
}) {
  const { t } = useTranslation();
  const L = useLocalized();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [renaming, setRenaming] = useState<string | null>(null);

  const moduleDrag = useDragReorder((id, to) => actions.onMoveModule(id, to));

  // A module the administrator has just navigated into must not stay folded.
  const selectedModuleId = selection.kind === "course" ? null : selection.moduleId;
  useEffect(() => {
    if (!selectedModuleId) return;
    setCollapsed((prev) => {
      if (!prev.has(selectedModuleId)) return prev;
      const next = new Set(prev);
      next.delete(selectedModuleId);
      return next;
    });
  }, [selectedModuleId]);

  const toggle = (moduleId: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(moduleId)) next.delete(moduleId);
      else next.add(moduleId);
      return next;
    });

  const courseSelected = selection.kind === "course";

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* The course itself is a selectable row: its information is part of the
          structure, not a separate screen you leave the builder for. */}
      <button
        type="button"
        onClick={() => actions.onSelect({ kind: "course" })}
        aria-current={courseSelected ? "true" : undefined}
        className={clsx(
          "flex w-full items-center gap-2.5 rounded-[var(--admin-radius-sm)] border p-3 text-left transition-colors",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
          courseSelected
            ? "border-[var(--gt-ink-900)] bg-[var(--gt-ink-900)] text-[var(--text-inverse)]"
            : "border-[var(--border-subtle)] bg-[var(--admin-panel-sunken)] hover:border-[var(--gt-ink-400)]",
        )}
      >
        <GraduationCap size={17} strokeWidth={1.9} aria-hidden="true" className="flex-none" />
        <span className="grid min-w-0 gap-0.5">
          <span
            className={clsx(
              "text-[10px] font-semibold uppercase tracking-[var(--tracking-eyebrow)]",
              courseSelected ? "text-[rgba(250,250,248,.62)]" : "text-[var(--text-subtle)]",
            )}
          >
            {t("admin.training.builder.course")}
          </span>
          <span className="truncate text-[length:var(--text-body-sm)] font-semibold">
            {L(course.title) || t("admin.training.create.fieldTitlePlaceholder")}
          </span>
        </span>
      </button>

      <div className="gt-admin-scroll mt-3 min-h-0 flex-1 overflow-y-auto pr-0.5">
        {course.modules.length === 0 ? (
          <EmptyState
            icon={GraduationCap}
            title={t("admin.training.builder.emptyTitle")}
            body={t("admin.training.builder.emptyBody")}
            action={
              <AdminButton variant="primary" iconLeft={Plus} onClick={actions.onAddModule}>
                {t("admin.training.builder.addFirstModule")}
              </AdminButton>
            }
          />
        ) : (
          <ul className="m-0 grid list-none gap-1 p-0" aria-label={t("admin.training.builder.treeLabel")}>
            {course.modules.map((module, index) => (
              <ModuleBranch
                key={module.id}
                module={module}
                index={index}
                total={course.modules.length}
                collapsed={collapsed.has(module.id)}
                renaming={renaming === module.id}
                selection={selection}
                actions={actions}
                lang={lang}
                drag={moduleDrag}
                onToggle={() => toggle(module.id)}
                onStartRename={() => setRenaming(module.id)}
                onEndRename={() => setRenaming(null)}
              />
            ))}
          </ul>
        )}
      </div>

      {course.modules.length > 0 && (
        <div className="mt-3 flex-none border-t border-[var(--border-subtle)] pt-3">
          <AdminButton variant="outline" iconLeft={Plus} fullWidth onClick={actions.onAddModule}>
            {t("admin.training.builder.addModule")}
          </AdminButton>
          <p className="m-0 mt-2 text-[length:var(--text-caption)] text-[var(--text-subtle)]">
            {t("admin.training.builder.dragHint")}
          </p>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function ModuleBranch({
  module,
  index,
  total,
  collapsed,
  renaming,
  selection,
  actions,
  lang,
  drag,
  onToggle,
  onStartRename,
  onEndRename,
}: {
  module: Module;
  index: number;
  total: number;
  collapsed: boolean;
  renaming: boolean;
  selection: Selection;
  actions: TreeActions;
  lang: string;
  drag: ReturnType<typeof useDragReorder>;
  onToggle: () => void;
  onStartRename: () => void;
  onEndRename: () => void;
}) {
  const { t } = useTranslation();
  const L = useLocalized();
  const stepDrag = useDragReorder((id, to) => actions.onMoveStep(module.id, id, to));

  const number = String(index + 1).padStart(2, "0");
  const name = L(module.title);
  const selected = selection.kind === "module" && selection.moduleId === module.id;

  const menu: MenuAction[] = [
    { id: "rename", label: t("admin.training.builder.rename"), icon: FileText, onSelect: onStartRename },
    {
      id: "add-step",
      label: t("admin.training.builder.addStep"),
      icon: Plus,
      onSelect: () => actions.onAddStep(module.id),
    },
    {
      id: "add-quiz",
      label: t("admin.training.builder.addQuiz"),
      icon: ListChecks,
      disabled: module.quiz !== null,
      onSelect: () => actions.onAddQuiz(module.id),
    },
    {
      id: "duplicate",
      label: t("admin.training.actions.duplicate"),
      icon: Copy,
      onSelect: () => actions.onDuplicateModule(module.id),
    },
    {
      id: "delete",
      label: t("admin.training.actions.delete"),
      icon: Trash2,
      tone: "danger",
      separated: true,
      onSelect: () => actions.onDeleteModule(module),
    },
  ];

  return (
    <li
      {...drag.itemProps(module.id, index)}
      className={clsx("rounded-[var(--admin-radius-sm)]", dragClasses(drag, module.id))}
    >
      <div
        className={clsx(
          rowBase,
          "pl-1",
          selected
            ? "bg-[var(--gt-blue-100)] font-semibold"
            : "hover:bg-[var(--surface-sunken)]",
        )}
      >
        <span
          aria-hidden="true"
          className="flex-none cursor-grab text-[var(--text-subtle)] opacity-0 transition-opacity group-hover/row:opacity-100 active:cursor-grabbing"
        >
          <GripVertical size={14} strokeWidth={2} />
        </span>

        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-label={
            collapsed
              ? t("admin.training.builder.expandModule", { name })
              : t("admin.training.builder.collapseModule", { name })
          }
          className="inline-flex h-6 w-6 flex-none items-center justify-center rounded-[var(--radius-xs)] text-[var(--text-muted)] transition-colors hover:bg-[var(--gt-ink-100)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
        >
          {collapsed ? (
            <ChevronRight size={14} strokeWidth={2.2} aria-hidden="true" />
          ) : (
            <ChevronDown size={14} strokeWidth={2.2} aria-hidden="true" />
          )}
        </button>

        {renaming ? (
          <RenameField
            value={name}
            onCommit={(next) => {
              if (next.trim()) actions.onRenameModule(module.id, next);
              onEndRename();
            }}
            onCancel={onEndRename}
          />
        ) : (
          <button
            type="button"
            onClick={() => actions.onSelect({ kind: "module", moduleId: module.id })}
            onDoubleClick={onStartRename}
            aria-current={selected ? "true" : undefined}
            className="grid min-w-0 flex-1 gap-0.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
          >
            <span className="text-[10px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-subtle)]">
              {t("admin.training.builder.moduleLabel", { number })}
            </span>
            <span className="truncate text-[length:var(--text-body-sm)] text-[var(--text-primary)]">{name}</span>
          </button>
        )}

        <span className="flex flex-none items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/row:opacity-100">
          <MoveButton
            direction="up"
            disabled={index === 0}
            onClick={() => actions.onMoveModule(module.id, "up")}
          />
          <MoveButton
            direction="down"
            disabled={index === total - 1}
            onClick={() => actions.onMoveModule(module.id, "down")}
          />
          <OverflowMenu label={t("admin.training.actions.more", { name })} actions={menu} />
        </span>
      </div>

      {!collapsed && (
        <ul className="m-0 grid list-none gap-0.5 p-0 pb-1 pl-[26px]">
          {module.steps.map((step, stepIndex) => {
            const stepSelected =
              selection.kind === "step" && selection.stepId === step.id;
            return (
              <li
                key={step.id}
                {...stepDrag.itemProps(step.id, stepIndex)}
                className={clsx("rounded-[var(--admin-radius-sm)]", dragClasses(stepDrag, step.id))}
              >
                <div
                  className={clsx(
                    rowBase,
                    "border-l border-[var(--border-subtle)] pl-2",
                    stepSelected
                      ? "bg-[var(--gt-ink-900)] text-[var(--text-inverse)]"
                      : "hover:bg-[var(--surface-sunken)]",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={clsx(
                      "flex-none cursor-grab opacity-0 transition-opacity group-hover/row:opacity-100 active:cursor-grabbing",
                      stepSelected ? "text-[rgba(250,250,248,.6)]" : "text-[var(--text-subtle)]",
                    )}
                  >
                    <GripVertical size={13} strokeWidth={2} />
                  </span>

                  <button
                    type="button"
                    onClick={() =>
                      actions.onSelect({ kind: "step", moduleId: module.id, stepId: step.id })
                    }
                    aria-current={stepSelected ? "true" : undefined}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
                  >
                    <FileText
                      size={13}
                      strokeWidth={2}
                      aria-hidden="true"
                      className={clsx("flex-none", stepSelected ? "" : "text-[var(--text-subtle)]")}
                    />
                    <span className="min-w-0 flex-1 truncate text-[length:var(--text-caption)]">
                      <span className="tabular-nums opacity-70">
                        {String(stepIndex + 1).padStart(2, "0")}
                      </span>{" "}
                      {L(step.title)}
                    </span>
                    <span
                      className={clsx(
                        "flex-none text-[10px] tabular-nums",
                        stepSelected ? "text-[rgba(250,250,248,.7)]" : "text-[var(--text-subtle)]",
                      )}
                    >
                      {step.blocks.length === 0
                        ? t("admin.training.builder.emptyStep")
                        : t("admin.training.builder.blocks", { count: step.blocks.length })}
                    </span>
                  </button>

                  <span className="flex flex-none items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/row:opacity-100">
                    <MoveButton
                      direction="up"
                      inverse={stepSelected}
                      disabled={stepIndex === 0}
                      onClick={() => actions.onMoveStep(module.id, step.id, "up")}
                    />
                    <MoveButton
                      direction="down"
                      inverse={stepSelected}
                      disabled={stepIndex === module.steps.length - 1}
                      onClick={() => actions.onMoveStep(module.id, step.id, "down")}
                    />
                    <OverflowMenu
                      label={t("admin.training.actions.more", { name: L(step.title) })}
                      actions={[
                        {
                          id: "duplicate",
                          label: t("admin.training.actions.duplicate"),
                          icon: Copy,
                          onSelect: () => actions.onDuplicateStep(module.id, step.id),
                        },
                        {
                          id: "delete",
                          label: t("admin.training.actions.delete"),
                          icon: Trash2,
                          tone: "danger",
                          separated: true,
                          onSelect: () => actions.onDeleteStep(module.id, step.id),
                        },
                      ]}
                    />
                  </span>
                </div>
              </li>
            );
          })}

          {/* The knowledge check closes every module, present or not: its absence
              is information, and hiding it would make a module with no check
              look identical to one that has not been scrolled far enough. */}
          <li>
            {module.quiz ? (
              <button
                type="button"
                onClick={() => actions.onSelect({ kind: "quiz", moduleId: module.id })}
                aria-current={
                  selection.kind === "quiz" && selection.moduleId === module.id ? "true" : undefined
                }
                className={clsx(
                  rowBase,
                  "border-l border-[var(--border-subtle)] pl-2",
                  selection.kind === "quiz" && selection.moduleId === module.id
                    ? "bg-[var(--gt-ink-900)] text-[var(--text-inverse)]"
                    : "hover:bg-[var(--surface-sunken)]",
                )}
              >
                <ListChecks size={13} strokeWidth={2} aria-hidden="true" className="ml-[21px] flex-none" />
                <span className="min-w-0 flex-1 truncate text-[length:var(--text-caption)] font-medium">
                  {L(module.quiz.title)}
                </span>
                <span className="flex-none text-[10px] tabular-nums opacity-70">
                  {t("admin.training.builder.quizQuestions", { count: module.quiz.questions.length })}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => actions.onAddQuiz(module.id)}
                className={clsx(
                  rowBase,
                  "border-l border-[var(--border-subtle)] pl-2 text-[var(--text-subtle)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]",
                )}
              >
                <Plus size={13} strokeWidth={2} aria-hidden="true" className="ml-[21px] flex-none" />
                <span className="truncate text-[length:var(--text-caption)]">
                  {t("admin.training.builder.addQuiz")}
                </span>
              </button>
            )}
          </li>

          <li>
            <button
              type="button"
              onClick={() => actions.onAddStep(module.id)}
              className={clsx(
                rowBase,
                "border-l border-[var(--border-subtle)] pl-2 text-[var(--text-subtle)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]",
              )}
            >
              <Plus size={13} strokeWidth={2} aria-hidden="true" className="ml-[21px] flex-none" />
              <span className="truncate text-[length:var(--text-caption)]">
                {t("admin.training.builder.addStep")}
              </span>
            </button>
          </li>

          {module.steps.length > 0 && (
            <li className="px-2 pt-1">
              <span className="text-[10px] text-[var(--text-subtle)]">
                {formatDuration(moduleDuration(module), lang)}
              </span>
            </li>
          )}
        </ul>
      )}
    </li>
  );
}

/* -------------------------------------------------------------------------- */

function MoveButton({
  direction,
  disabled,
  inverse,
  onClick,
}: {
  direction: "up" | "down";
  disabled: boolean;
  inverse?: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  const Icon = direction === "up" ? MoveUp : MoveDown;
  const label = t(direction === "up" ? "admin.training.builder.moveUp" : "admin.training.builder.moveDown");
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={clsx(
        "inline-flex h-6 w-6 items-center justify-center rounded-[var(--radius-xs)] transition-colors",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]",
        "disabled:cursor-not-allowed disabled:opacity-30",
        inverse
          ? "text-[rgba(250,250,248,.75)] hover:bg-[rgba(250,250,248,.14)]"
          : "text-[var(--text-muted)] hover:bg-[var(--gt-ink-100)] hover:text-[var(--text-primary)]",
      )}
    >
      <Icon size={12} strokeWidth={2.2} aria-hidden="true" />
    </button>
  );
}

/** Inline rename. Enter commits, Escape abandons, blur commits. */
function RenameField({
  value,
  onCommit,
  onCancel,
}: {
  value: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.select();
  }, []);

  return (
    <input
      ref={ref}
      type="text"
      value={draft}
      aria-label={t("admin.training.builder.rename")}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onCommit(draft)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onCommit(draft);
        } else if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
      className="gt-admin-field min-h-0 flex-1 py-1 text-[length:var(--text-body-sm)]"
    />
  );
}
