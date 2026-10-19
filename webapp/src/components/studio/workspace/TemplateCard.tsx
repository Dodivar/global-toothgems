import clsx from "clsx";
import { CopyPlus, Eye } from "lucide-react";
import { useFormat } from "../../../lib/format";
import { isNewTemplate, type StudioTemplate } from "../../../lib/studioWorkspace/templates";
import { ScenePreview } from "./ScenePreview";
import { focusRing, iconButton, tagChip, useWorkspaceFormat } from "./workspaceStyles";

/** The template's render when it has one, else the drawn front view of its scene. */
export function TemplateThumb({ template, className }: { template: StudioTemplate; className?: string }) {
  return template.thumbnailUrl ? (
    <img src={template.thumbnailUrl} alt="" loading="lazy" decoding="async" className={clsx("h-full w-full object-cover", className)} />
  ) : (
    <ScenePreview pieces={template.scene.pieces} className={className} />
  );
}

/** "New" for a template published in the last days: a word, not a colour alone. */
export function NewBadge({ className }: { className?: string }) {
  const { t } = useWorkspaceFormat();
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] bg-[var(--gt-ink-900)]/85 px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[.08em] text-white backdrop-blur-[6px]",
        className,
      )}
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[var(--accent-cta)]" />
      {t("studio.templates.new")}
    </span>
  );
}

/**
 * One Global Toothgems template: its scene, name, piece count and publication
 * date, with "Use this template" as the obvious action and a closer look beside it.
 */
export function TemplateCard({
  template,
  busy,
  onUse,
  onPreview,
}: {
  template: StudioTemplate;
  busy: boolean;
  onUse: () => void;
  onPreview: () => void;
}) {
  const { t, now } = useWorkspaceFormat();
  const { formatDate } = useFormat();
  const fresh = isNewTemplate(template.publishedAt, now);

  return (
    <article className="group/card relative flex flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-[var(--shadow-sm)] transition-[box-shadow,transform] duration-[var(--duration-normal)] ease-[var(--ease-out-soft)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)]">
      <button
        type="button"
        onClick={onPreview}
        aria-label={t("studio.templates.preview", { name: template.name })}
        className={clsx("relative block aspect-[4/3] w-full overflow-hidden bg-[var(--gt-blue-100)]", focusRing, "focus-visible:-outline-offset-2")}
      >
        <TemplateThumb
          template={template}
          className="transition-transform duration-[var(--duration-slow)] ease-[var(--ease-out-soft)] group-hover/card:scale-[1.035]"
        />
        {fresh && <NewBadge className="absolute left-3 top-3" />}
      </button>

      <div className="flex flex-1 flex-col gap-2 p-4 pb-3">
        <div className="flex items-start gap-2">
          <h3 className="m-0 min-w-0 flex-1 truncate text-[15px] font-[var(--weight-black)] leading-snug tracking-[var(--tracking-tight)] text-[var(--text-primary)]">
            {template.name}
          </h3>
          <button
            type="button"
            onClick={onPreview}
            aria-label={t("studio.templates.preview", { name: template.name })}
            title={t("studio.templates.preview", { name: template.name })}
            className={clsx(iconButton, "-mr-2 -mt-1.5 h-8 w-8")}
          >
            <Eye size={16} aria-hidden="true" />
          </button>
        </div>
        <p className="m-0 text-[12.5px] font-semibold text-[var(--text-primary)]">{t("studio.workspace.gems", { count: template.elementCount })}</p>
        <div className="mt-auto flex items-center gap-2 pt-1">
          <span className="min-w-0 flex-1 truncate text-[11.5px] text-[var(--text-subtle)]">
            {t("studio.templates.publishedOn", { date: formatDate(template.publishedAt) })}
          </span>
          {template.tags.slice(0, 1).map((tag) => (
            <span key={tag} className={tagChip}>
              {tag}
            </span>
          ))}
        </div>
      </div>
      <div className="border-t border-[var(--border-subtle)] px-2 py-1.5">
        <button
          type="button"
          onClick={onUse}
          disabled={busy}
          aria-busy={busy || undefined}
          className={clsx(
            "flex w-full items-center justify-center gap-2 rounded-[var(--radius-sm)] py-2 text-[12px] font-bold uppercase tracking-[var(--tracking-wide)] text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-brand-wash)] disabled:opacity-60",
            focusRing,
          )}
        >
          <CopyPlus size={14} aria-hidden="true" className="text-[var(--gt-blue-600)]" />
          {busy ? t("studio.templates.using") : t("studio.templates.use")}
        </button>
      </div>
    </article>
  );
}
