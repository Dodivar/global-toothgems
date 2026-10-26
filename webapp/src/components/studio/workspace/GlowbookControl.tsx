import { useState } from "react";
import { Sparkles, Send, Trash2 } from "lucide-react";
import { Button } from "../../ui/Button";
import { useNavigate } from "../../../lib/navigation";
import { studioSectionPath } from "../../../lib/studioUrl";
import { useGlowbook } from "../../../lib/studioWorkspace/glowbookStore";
import type { Creation } from "../../../lib/studioWorkspace/types";
import { ModerationBadge } from "./GlowbookStatus";
import { PlanLocked } from "./PlanLocked";
import { useGlowbookPlan } from "../../../lib/studioAccess";
import { useWorkspaceFormat } from "./workspaceStyles";

/**
 * A creation's place in the artist's Glowbook, in its detail (My Creations):
 * the only place a creation is added — never from the editor (decision 99).
 * Adding sends it to moderation; it is public once approved, and its later
 * saves are public at once.
 */
export function GlowbookControl({ creation, onLeave }: { creation: Creation; onLeave: () => void }) {
  const { t } = useWorkspaceFormat();
  const gb = useGlowbook();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const plan = useGlowbookPlan();
  if (plan === false) return <PlanLocked feature="glowbook" compact onLeave={onLeave} />;
  if (gb.status !== "ready") return null;

  const item = gb.itemFor(creation.id);
  const run = async (action: () => Promise<boolean>) => {
    setPending(true);
    await action();
    setPending(false);
  };
  const toGlowbook = () => {
    onLeave();
    navigate(studioSectionPath("glowbook"));
  };

  const text = !gb.glowbook
    ? t("studio.glowbook.control.noGlowbook")
    : !item
      ? creation.elementCount === 0
        ? t("studio.glowbook.control.empty")
        : t("studio.glowbook.control.notIn")
      : item.status === "rejected" && item.reviewNote
        ? t("studio.glowbook.reason", { note: item.reviewNote })
        : t(`studio.glowbook.control.${item.status}`);

  return (
    <section
      aria-label={t("studio.glowbook.control.title")}
      className="flex flex-wrap items-center gap-3 rounded-[var(--radius-md)] border border-[var(--gt-blue-200)] bg-[var(--gt-blue-50)] px-4 py-3"
    >
      <Sparkles size={18} aria-hidden="true" className="flex-none text-[var(--gt-blue-600)]" />
      <div className="grid min-w-0 flex-1 basis-[220px] gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="m-0 text-[13px] font-bold text-[var(--text-primary)]">{t("studio.glowbook.control.title")}</p>
          {item && <ModerationBadge status={item.status} kind="item" />}
        </div>
        <p className="m-0 text-[12px] leading-snug text-[var(--text-muted)]">{text}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {!gb.glowbook ? (
          <Button variant="dark" size="sm" iconLeft={Sparkles} onClick={toGlowbook}>
            {t("studio.glowbook.control.create")}
          </Button>
        ) : !item ? (
          <Button
            variant="dark"
            size="sm"
            iconLeft={Send}
            disabled={pending || creation.elementCount === 0}
            aria-busy={pending || undefined}
            onClick={() => void run(() => gb.add(creation))}
          >
            {t("studio.glowbook.control.add")}
          </Button>
        ) : (
          <>
            {item.status === "rejected" && (
              <Button variant="outline" size="sm" iconLeft={Send} disabled={pending} onClick={() => void run(() => gb.add(creation))}>
                {t("studio.glowbook.resubmit")}
              </Button>
            )}
            <Button variant="ghost" size="sm" iconLeft={Trash2} disabled={pending} onClick={() => void run(() => gb.remove(creation))}>
              {t("studio.glowbook.control.remove")}
            </Button>
          </>
        )}
      </div>
    </section>
  );
}
