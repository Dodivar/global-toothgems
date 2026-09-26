import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Clock, Eye, FileText, Trash2 } from "lucide-react";
import { AdminButton } from "../AdminButton";
import { ConfirmationDialog } from "../ConfirmationDialog";
import { EmptyState } from "../EmptyState";
import { FormField } from "../FormField";
import { Section } from "./TrainingPrimitives";
import {
  AddContentMenu,
  BlockCard,
  BlockView,
  ImageBlockEditor,
  TextBlockEditor,
  VideoBlockEditor,
} from "./ContentBlocks";
import type { BlockType, ContentBlock, ImageBlock, Module, Step, TextBlock, VideoBlock } from "../../../data/adminTraining";
import { useAdminTraining } from "../../../lib/adminTraining";
import { useToast } from "../../../lib/toast";
import { dragClasses, useDragReorder } from "../../../lib/useDragReorder";
import type { ContentLang } from "../../../lib/localized";

/**
 * The content step editor — where a lesson is actually written.
 *
 * A step is a sequence of blocks of mixed types, so the editor is a list rather
 * than a form with a "content" field: text, image and video sit side by side in
 * whatever order the lesson needs, and the interface has to make that obvious
 * before the administrator has added anything.
 *
 * Unlike the catalogue's presentational table, the builder's editors talk to
 * the store directly. Threading two dozen callbacks through three panels would
 * obscure the thing this file is about; the store is still the only place a
 * mutation happens.
 */
export function StepEditor({
  courseId,
  module,
  step,
  lang,
  onPreview,
}: {
  courseId: string;
  module: Module;
  step: Step;
  lang: ContentLang;
  onPreview: () => void;
}) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const {
    updateStep,
    addBlock,
    updateBlock,
    duplicateBlock,
    deleteBlock,
    moveBlock,
    deleteStep,
  } = useAdminTraining();

  const [openBlock, setOpenBlock] = useState<string | null>(null);
  const [removing, setRemoving] = useState<ContentBlock | null>(null);
  const [removingStep, setRemovingStep] = useState(false);

  const drag = useDragReorder((id, to) => moveBlock(courseId, module.id, step.id, id, to));

  const index = module.steps.findIndex((s) => s.id === step.id);
  const number = String(index + 1).padStart(2, "0");

  const add = (type: BlockType, afterId?: string) => {
    const id = addBlock(courseId, module.id, step.id, type, afterId);
    // A new block opens straight into its editor: adding one is always the
    // first half of filling it in.
    if (id) setOpenBlock(id);
    showToast(t("admin.training.toasts.blockAddedTitle"), t(`admin.training.blocks.${type}`));
  };

  const confirmRemove = () => {
    if (!removing) return;
    deleteBlock(courseId, module.id, step.id, removing.id);
    if (openBlock === removing.id) setOpenBlock(null);
    setRemoving(null);
    showToast(t("admin.training.toasts.blockDeletedTitle"), undefined, "info");
  };

  return (
    <div className="grid gap-4">
      <Section
        title={`${t("admin.training.builder.stepLabel", { number })} — ${step.title[lang] || t("admin.training.step.title")}`}
        description={t("admin.training.step.contentHint")}
        icon={FileText}
        aside={
          <div className="flex flex-none items-center gap-2">
            <AdminButton variant="ghost" size="sm" iconLeft={Eye} onClick={onPreview}>
              {t("admin.training.step.preview")}
            </AdminButton>
            <AdminButton
              variant="ghost"
              size="sm"
              iconLeft={Trash2}
              onClick={() => setRemovingStep(true)}
              className="text-[var(--status-error-fg)] hover:bg-[var(--status-error-bg)]"
            >
              {t("admin.training.actions.delete")}
            </AdminButton>
          </div>
        }
      >
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_140px]">
          <FormField label={t("admin.training.step.fieldTitle")} hint={t("admin.training.step.fieldTitleHint")} required>
            {(props) => (
              <input
                {...props}
                type="text"
                className="gt-admin-field"
                value={step.title[lang]}
                onChange={(e) =>
                  updateStep(courseId, module.id, step.id, { title: { ...step.title, [lang]: e.target.value } })
                }
              />
            )}
          </FormField>

          <FormField label={t("admin.training.step.fieldSummary")} hint={t("admin.training.step.fieldSummaryHint")}>
            {(props) => (
              <input
                {...props}
                type="text"
                className="gt-admin-field"
                value={step.summary[lang]}
                onChange={(e) =>
                  updateStep(courseId, module.id, step.id, { summary: { ...step.summary, [lang]: e.target.value } })
                }
              />
            )}
          </FormField>

          <FormField label={t("admin.training.step.fieldDuration")} hint={t("admin.training.step.fieldDurationHint")}>
            {(props) => (
              <div className="relative">
                <input
                  {...props}
                  type="number"
                  min={0}
                  max={240}
                  className="gt-admin-field pr-11 tabular-nums"
                  value={step.duration}
                  onChange={(e) =>
                    updateStep(courseId, module.id, step.id, { duration: Number(e.target.value) || 0 })
                  }
                />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[length:var(--text-caption)] text-[var(--text-muted)]"
                >
                  {t("admin.training.step.minutes")}
                </span>
              </div>
            )}
          </FormField>
        </div>
      </Section>

      <Section
        title={t("admin.training.step.content")}
        description={t("admin.training.step.blocksSummary", { count: step.blocks.length })}
        icon={Clock}
      >
        {step.blocks.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={t("admin.training.step.emptyTitle")}
            body={t("admin.training.step.emptyBody")}
            action={<AddContentMenu onAdd={(type) => add(type)} label={t("admin.training.step.addFirstContent")} />}
          />
        ) : (
          <div className="grid gap-1">
            {step.blocks.map((block, blockIndex) => (
              <div key={block.id}>
                <BlockCard
                  block={block}
                  index={blockIndex}
                  total={step.blocks.length}
                  lang={lang}
                  open={openBlock === block.id}
                  dragProps={drag.itemProps(block.id, blockIndex)}
                  dragClassName={dragClasses(drag, block.id)}
                  actions={{
                    onEdit: () => setOpenBlock((current) => (current === block.id ? null : block.id)),
                    onDuplicate: () => {
                      duplicateBlock(courseId, module.id, step.id, block.id);
                      showToast(t("admin.training.toasts.blockDuplicatedTitle"));
                    },
                    onDelete: () => setRemoving(block),
                    onMoveUp: () => moveBlock(courseId, module.id, step.id, block.id, "up"),
                    onMoveDown: () => moveBlock(courseId, module.id, step.id, block.id, "down"),
                  }}
                >
                  <BlockEditor
                    block={block}
                    lang={lang}
                    onChange={(patch) => updateBlock(courseId, module.id, step.id, block.id, patch)}
                  />
                </BlockCard>

                {/* Between every pair of blocks, so inserting in the middle is a
                    click where you want it rather than an add-then-reorder. */}
                <AddContentMenu variant="inline" onAdd={(type) => add(type, block.id)} />
              </div>
            ))}

            <AddContentMenu onAdd={(type) => add(type)} />
          </div>
        )}
      </Section>

      <ConfirmationDialog
        open={removing !== null}
        icon={Trash2}
        tone="danger"
        title={t("admin.training.blocks.deleteTitle")}
        body={<p className="m-0">{t("admin.training.blocks.deleteBody")}</p>}
        confirmLabel={t("admin.training.actions.delete")}
        cancelLabel={t("common.cancel")}
        onConfirm={confirmRemove}
        onCancel={() => setRemoving(null)}
      />

      <ConfirmationDialog
        open={removingStep}
        icon={Trash2}
        tone="danger"
        title={t("admin.training.step.deleteTitle")}
        body={<p className="m-0">{t("admin.training.step.deleteBody", { name: step.title[lang] })}</p>}
        confirmLabel={t("admin.training.actions.delete")}
        cancelLabel={t("common.cancel")}
        onConfirm={() => {
          deleteStep(courseId, module.id, step.id);
          setRemovingStep(false);
          showToast(t("admin.training.toasts.stepDeletedTitle"), undefined, "info");
        }}
        onCancel={() => setRemovingStep(false)}
      />
    </div>
  );
}

/** Dispatches to the editor for this block's type. */
function BlockEditor({
  block,
  lang,
  onChange,
}: {
  block: ContentBlock;
  lang: ContentLang;
  onChange: (patch: Partial<ContentBlock>) => void;
}) {
  if (block.type === "text") {
    return <TextBlockEditor block={block} lang={lang} onChange={onChange as (p: Partial<TextBlock>) => void} />;
  }
  if (block.type === "image") {
    return <ImageBlockEditor block={block} lang={lang} onChange={onChange as (p: Partial<ImageBlock>) => void} />;
  }
  return <VideoBlockEditor block={block} lang={lang} onChange={onChange as (p: Partial<VideoBlock>) => void} />;
}

/** The step as a learner sees it. Used by the step-level preview drawer. */
export function StepView({ step, lang }: { step: Step; lang: ContentLang }) {
  return (
    <div className="grid gap-6">
      <header className="grid gap-1">
        <h2 className="text-[length:var(--text-h3)]">{step.title[lang]}</h2>
        {step.summary[lang] && (
          <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">{step.summary[lang]}</p>
        )}
      </header>
      {step.blocks.map((block) => (
        <BlockView key={block.id} block={block} lang={lang} />
      ))}
    </div>
  );
}
