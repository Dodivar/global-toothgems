import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "../../ui/Button";
import { useNavigate } from "../../../lib/navigation";
import { ACCOUNT_STUDIO_PATH } from "../StudioPlans";
import { STUDIO_GLOWBOOK_PLAN } from "../../../data/studio";
import { useWorkspaceFormat } from "./workspaceStyles";

/**
 * The Glowbook below its plan (decision 113): what it is, that it comes with
 * the Atelier plan, and the way to the subscription page. A Glowbook already
 * opened is hidden from the public meanwhile and comes back as it was.
 * `compact` is the line shown in a creation's detail.
 */
export function GlowbookLocked({ compact = false, onLeave }: { compact?: boolean; onLeave?: () => void }) {
  const { t } = useWorkspaceFormat();
  const navigate = useNavigate();
  const plan = t(`studio.plans.items.${STUDIO_GLOWBOOK_PLAN}.name`);
  const go = () => {
    onLeave?.();
    navigate(ACCOUNT_STUDIO_PATH);
  };

  return (
    <section
      aria-label={t("studio.glowbook.locked.title", { plan })}
      className={
        compact
          ? "flex flex-wrap items-center gap-3 rounded-[var(--radius-md)] border border-[var(--gt-blue-200)] bg-[var(--gt-blue-50)] px-4 py-3"
          : "grid max-w-[640px] gap-4 rounded-[var(--radius-xl)] border border-[var(--gt-blue-200)] bg-[var(--gt-blue-50)] p-6"
      }
    >
      <Sparkles size={compact ? 18 : 24} aria-hidden="true" className="flex-none text-[var(--gt-blue-600)]" />
      <div className={compact ? "grid min-w-0 flex-1 basis-[220px] gap-1" : "grid gap-2"}>
        <p className={compact ? "m-0 text-[13px] font-bold text-[var(--text-primary)]" : "m-0 text-[length:var(--text-h4)] font-bold text-[var(--text-primary)]"}>
          {t("studio.glowbook.locked.title", { plan })}
        </p>
        <p className={compact ? "m-0 text-[12px] leading-snug text-[var(--text-muted)]" : "m-0 text-[length:var(--text-body-sm)] leading-relaxed text-[var(--text-body)]"}>
          {t(compact ? "studio.glowbook.locked.short" : "studio.glowbook.locked.body")}
        </p>
        {!compact && <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("studio.glowbook.locked.existing")}</p>}
      </div>
      <div>
        <Button variant="dark" size="sm" iconRight={ArrowRight} onClick={go}>
          {t("studio.glowbook.locked.cta", { plan })}
        </Button>
      </div>
    </section>
  );
}
