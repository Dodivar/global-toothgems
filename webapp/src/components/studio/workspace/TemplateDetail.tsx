import { useState } from "react";
import { CopyPlus, EyeOff, LayoutTemplate } from "lucide-react";
import { Dialog } from "../../ui/Dialog";
import { Button } from "../../ui/Button";
import { useFormat } from "../../../lib/format";
import { isNewTemplate, type StudioTemplate } from "../../../lib/studioWorkspace/templates";
import { useStudioTemplates } from "../../../lib/studioWorkspace/templatesStore";
import { FrontViewSection } from "../FrontViewPanel";
import { HelpHint } from "./HelpHint";
import { NewBadge, TemplateThumb } from "./TemplateCard";
import { tagChip, useWorkspaceFormat } from "./workspaceStyles";

/**
 * A closer look at one template before using it: large preview, description,
 * the numbers and the front view. Staff who publish templates can take it out
 * of the library from here (whoever made it), after confirming.
 */
export function TemplateDetail({
  template,
  busy,
  onUse,
  onClose,
}: {
  template: StudioTemplate;
  busy: boolean;
  onUse: () => void;
  onClose: () => void;
}) {
  const { formatDate } = useFormat();
  const { t, price, count, now } = useWorkspaceFormat();
  const lib = useStudioTemplates();
  const [confirming, setConfirming] = useState(false);
  const [unpublishing, setUnpublishing] = useState(false);

  const facts: [string, string][] = [
    [t("studio.workspace.detail.elements"), count(template.elementCount)],
    [t("studio.templates.detail.published"), formatDate(template.publishedAt)],
    [t("studio.workspace.detail.modified"), formatDate(template.updatedAt)],
  ];

  const unpublish = async () => {
    setUnpublishing(true);
    const done = await lib.setPublished(template, false);
    setUnpublishing(false);
    if (done) onClose();
  };

  return (
    <Dialog open onClose={onClose} size="lg" title={template.name} icon={<LayoutTemplate size={17} />} closeLabel={t("studio.workspace.close")}>
      <div className="relative -mx-1 -mt-1 aspect-[16/10] overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--gt-blue-100)]">
        <TemplateThumb template={template} />
        {isNewTemplate(template.publishedAt, now) && <NewBadge className="absolute left-3 top-3" />}
      </div>

      {template.description ? (
        <p className="m-0 text-[length:var(--text-body-sm)] leading-relaxed text-[var(--text-primary)]">{template.description}</p>
      ) : (
        <p className="m-0 text-[length:var(--text-body-sm)] italic text-[var(--text-subtle)]">{t("studio.workspace.detail.noDescription")}</p>
      )}

      <dl className="m-0 grid grid-cols-2 gap-x-6 gap-y-3 rounded-[var(--radius-md)] bg-[var(--surface-sunken)] p-4 sm:grid-cols-4">
        <div className="grid gap-0.5">
          <dt className="flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-subtle)]">
            {t("studio.workspace.detail.estimate")}
            <HelpHint id="estimate" className="-my-1 h-5 w-5" />
          </dt>
          <dd className="m-0 text-[15px] font-[var(--weight-black)] text-[var(--text-primary)]">{price(template.estimatedPriceMinor)}</dd>
        </div>
        {facts.map(([label, value]) => (
          <div key={label} className="grid gap-0.5">
            <dt className="text-[10.5px] font-bold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-subtle)]">{label}</dt>
            <dd className="m-0 text-[13.5px] font-semibold text-[var(--text-primary)]">{value}</dd>
          </div>
        ))}
      </dl>

      {template.tags.length > 0 && (
        <ul aria-label={t("studio.workspace.details.tags")} className="m-0 flex list-none flex-wrap gap-1.5 p-0">
          {template.tags.map((tag) => (
            <li key={tag} className={tagChip}>
              {tag}
            </li>
          ))}
        </ul>
      )}

      <FrontViewSection pieces={template.scene.pieces} model={template.scene.model} />

      <p className="m-0 text-[12.5px] leading-relaxed text-[var(--text-muted)]">{t("studio.templates.detail.useHint")}</p>

      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border-subtle)] pt-4">
        <Button variant="primary" size="sm" iconLeft={CopyPlus} disabled={busy} onClick={onUse}>
          {busy ? t("studio.templates.using") : t("studio.templates.use")}
        </Button>
        {lib.canPublish &&
          (confirming ? (
            <span className="flex flex-wrap items-center gap-2 sm:ml-auto">
              <span className="text-[12.5px] text-[var(--text-muted)]">{t("studio.templates.staff.confirmUnpublish")}</span>
              <Button variant="outline" size="sm" onClick={() => setConfirming(false)}>
                {t("studio.workspace.cancel")}
              </Button>
              <Button variant="dark" size="sm" iconLeft={EyeOff} disabled={unpublishing} onClick={() => void unpublish()}>
                {t("studio.templates.staff.unpublish")}
              </Button>
            </span>
          ) : (
            <Button variant="ghost" size="sm" iconLeft={EyeOff} className="sm:ml-auto" onClick={() => setConfirming(true)}>
              {t("studio.templates.staff.unpublish")}
            </Button>
          ))}
      </div>
    </Dialog>
  );
}
