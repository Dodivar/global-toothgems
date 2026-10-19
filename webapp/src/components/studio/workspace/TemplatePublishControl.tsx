import { useState } from "react";
import { EyeOff, LayoutTemplate } from "lucide-react";
import { Button } from "../../ui/Button";
import { useFormat } from "../../../lib/format";
import { useStudioTemplates } from "../../../lib/studioWorkspace/templatesStore";
import type { Creation } from "../../../lib/studioWorkspace/types";
import { useWorkspaceFormat } from "./workspaceStyles";

/**
 * For team members who publish templates (`manage_content`): publish one of
 * their own creations as a Global Toothgems template, or take it out of the
 * library. Shown to nobody else; the database refuses anyone else anyway.
 */
export function TemplatePublishControl({ creation }: { creation: Creation }) {
  const { t } = useWorkspaceFormat();
  const { formatDate } = useFormat();
  const lib = useStudioTemplates();
  const [pending, setPending] = useState(false);
  if (!lib.canPublish || lib.status !== "ready") return null;

  const published = lib.templates.find((x) => x.id === creation.id);
  const toggle = async () => {
    setPending(true);
    await lib.setPublished(creation, !published);
    setPending(false);
  };

  return (
    <section
      aria-label={t("studio.templates.staff.title")}
      className="flex flex-wrap items-center gap-3 rounded-[var(--radius-md)] border border-dashed border-[var(--gt-blue-300)] px-4 py-3"
    >
      <LayoutTemplate size={18} aria-hidden="true" className="flex-none text-[var(--gt-blue-600)]" />
      <div className="grid min-w-0 flex-1 basis-[220px] gap-0.5">
        <p className="m-0 text-[13px] font-bold text-[var(--text-primary)]">{t("studio.templates.staff.title")}</p>
        <p className="m-0 text-[12px] text-[var(--text-muted)]">
          {published
            ? t("studio.templates.staff.publishedSince", { date: formatDate(published.publishedAt) })
            : creation.elementCount === 0
              ? t("studio.templates.staff.emptyDesign")
              : t("studio.templates.staff.notPublished")}
        </p>
      </div>
      <Button
        variant={published ? "outline" : "dark"}
        size="sm"
        iconLeft={published ? EyeOff : LayoutTemplate}
        disabled={pending || (!published && creation.elementCount === 0)}
        aria-busy={pending || undefined}
        onClick={() => void toggle()}
      >
        {published ? t("studio.templates.staff.unpublish") : t("studio.templates.staff.publish")}
      </Button>
    </section>
  );
}
