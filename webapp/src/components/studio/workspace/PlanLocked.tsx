import { ArrowRight, FolderPlus, LayoutTemplate, ScanFace, Sparkles, SquareDashed, type LucideIcon } from "lucide-react";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { useNavigate } from "../../../lib/navigation";
import { ACCOUNT_STUDIO_PATH } from "../StudioPlans";
import { lowestPlanWith, type LockedFeature } from "../../../lib/studioEntitlements";
import { useWorkspaceFormat } from "./workspaceStyles";

export type { LockedFeature };

const ICON: Record<LockedFeature, LucideIcon> = {
  glowbook: Sparkles,
  templates: LayoutTemplate,
  collections: FolderPlus,
  transparentExport: SquareDashed,
  tryOn: ScanFace,
};

/**
 * A Studio feature below its plan (decision 113): what it does, the lowest
 * plan that opens it (`lib/studioEntitlements.ts`) and the way to the
 * subscription page. `compact` is the one-line version (a creation's detail);
 * the full version adds a note on what the member keeps (`.kept`).
 * The database refuses the feature anyway — this only says why.
 */
export function PlanLocked({ feature, compact = false, onLeave }: { feature: LockedFeature; compact?: boolean; onLeave?: () => void }) {
  const { t } = useWorkspaceFormat();
  const navigate = useNavigate();
  const k = `studio.access.planLocked.${feature}`;
  const plan = t(`studio.plans.items.${lowestPlanWith(feature)}.name`);
  const Icon = ICON[feature];
  const go = () => {
    onLeave?.();
    navigate(ACCOUNT_STUDIO_PATH);
  };

  return (
    <section
      aria-label={t(`${k}.title`, { plan })}
      className={
        compact
          ? "flex flex-wrap items-center gap-3 rounded-[var(--radius-md)] border border-[var(--gt-blue-200)] bg-[var(--gt-blue-50)] px-4 py-3"
          : "grid max-w-[640px] gap-4 rounded-[var(--radius-xl)] border border-[var(--gt-blue-200)] bg-[var(--gt-blue-50)] p-6"
      }
    >
      <Icon size={compact ? 18 : 24} aria-hidden="true" className="flex-none text-[var(--gt-blue-600)]" />
      <div className={compact ? "grid min-w-0 flex-1 basis-[220px] gap-1" : "grid gap-2"}>
        <p className={compact ? "m-0 text-[13px] font-bold text-[var(--text-primary)]" : "m-0 text-[length:var(--text-h4)] font-bold text-[var(--text-primary)]"}>
          {t(`${k}.title`, { plan })}
        </p>
        <p className={compact ? "m-0 text-[12px] leading-snug text-[var(--text-muted)]" : "m-0 text-[length:var(--text-body-sm)] leading-relaxed text-[var(--text-body)]"}>
          {t(compact ? `${k}.short` : `${k}.body`)}
        </p>
        {!compact && <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t(`${k}.kept`)}</p>}
      </div>
      <div>
        <Button variant="dark" size="sm" iconRight={ArrowRight} onClick={go}>
          {t("studio.access.planLocked.cta", { plan })}
        </Button>
      </div>
    </section>
  );
}

/** The same panel in a dialog, for an action opened from a menu or a button (a folder to create, a creation to file). */
export function PlanLockedDialog({ feature, onClose }: { feature: LockedFeature; onClose: () => void }) {
  const { t } = useWorkspaceFormat();
  const plan = t(`studio.plans.items.${lowestPlanWith(feature)}.name`);
  const Icon = ICON[feature];
  return (
    <Dialog open onClose={onClose} title={t(`studio.access.planLocked.${feature}.title`, { plan })} icon={<Icon size={17} />} closeLabel={t("studio.workspace.close")}>
      <PlanLocked feature={feature} onLeave={onClose} />
    </Dialog>
  );
}
