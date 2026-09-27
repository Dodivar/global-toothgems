import clsx from "clsx";
import { ChevronDown, Gem, Keyboard, Layers, MessageSquareHeart, MousePointer2, PlayCircle, Repeat, Save, Sparkles, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../../ui/Button";
import { openWorkspaceDialog } from "../../../lib/studioWorkspace/workspaceUi";
import { eyebrow, focusRing } from "./workspaceStyles";

/** The six short lessons, each under `studio.workspace.help.tutorials.<id>`. */
const TUTORIALS: { id: string; icon: LucideIcon; accent?: boolean }[] = [
  { id: "choose", icon: Gem },
  { id: "place", icon: MousePointer2 },
  { id: "compose", icon: Sparkles },
  { id: "save", icon: Save, accent: true },
  { id: "groups", icon: Layers, accent: true },
  { id: "reuse", icon: Repeat },
];

const FAQ = ["saving", "groups", "estimate"] as const;

/** Shortcuts the editor already understands (see `StudioEditor`). */
const SHORTCUTS: { keys: string[]; id: string }[] = [
  { keys: ["Ctrl", "Z"], id: "undo" },
  { keys: ["Ctrl", "Shift", "Z"], id: "redo" },
  { keys: ["Shift", "Click"], id: "multi" },
  { keys: ["Ctrl", "A"], id: "all" },
  { keys: ["D"], id: "duplicate" },
  { keys: ["Del"], id: "delete" },
  { keys: ["Esc"], id: "deselect" },
];

/**
 * Help & Tutorial: the studio explained in six short, visual lessons, with
 * the details folded away until asked for (progressive disclosure), the
 * common questions, and the keyboard shortcuts.
 */
export function HelpPanel() {
  const { t } = useTranslation();

  return (
    <div className="mx-auto grid w-full max-w-[1080px] gap-10 px-4 pb-16 pt-6 sm:px-8 sm:pt-10">
      <header className="flex flex-wrap items-end gap-x-6 gap-y-4">
        <div className="grid min-w-0 flex-1 basis-[320px] gap-2">
          <p className={eyebrow}>{t("studio.workspace.help.eyebrow")}</p>
          <h1 className="m-0 text-[clamp(1.6rem,2.6vw,2.25rem)] font-[var(--weight-black)] leading-[1.1] tracking-[var(--tracking-tight)] text-[var(--text-primary)]">
            {t("studio.workspace.help.title")}
          </h1>
          <p className="m-0 max-w-[58ch] text-[length:var(--text-body-sm)] leading-relaxed text-[var(--text-muted)]">
            {t("studio.workspace.help.sub")}
          </p>
        </div>
        <Button variant="outline" size="sm" iconLeft={PlayCircle} onClick={() => openWorkspaceDialog({ kind: "onboarding" })}>
          {t("studio.workspace.help.replayTour")}
        </Button>
      </header>

      <ol className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))] gap-4 p-0">
        {TUTORIALS.map(({ id, icon: Icon, accent }, i) => (
          <li key={id} className="grid">
            <article className="flex flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-[var(--shadow-sm)]">
              <div
                aria-hidden="true"
                className="relative flex h-[92px] items-center justify-between overflow-hidden bg-[radial-gradient(90%_120%_at_85%_0%,var(--gt-blue-200),var(--gt-blue-50)_70%)] px-5"
              >
                <span className="text-[40px] font-[var(--weight-black)] leading-none tracking-[var(--tracking-tight)] text-[var(--gt-blue-400)]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span
                  className={clsx(
                    "grid h-12 w-12 place-items-center rounded-[var(--radius-md)] border border-white/80 bg-white/75 shadow-[var(--shadow-sm)] backdrop-blur-[6px]",
                    accent ? "text-[var(--accent-cta-ink)]" : "text-[var(--gt-blue-700)]",
                  )}
                >
                  <Icon size={22} />
                </span>
              </div>
              <div className="grid flex-1 content-start gap-1.5 p-5 pb-3">
                <h2 className="m-0 text-[16px] font-[var(--weight-black)] tracking-[var(--tracking-tight)] text-[var(--text-primary)]">
                  {t(`studio.workspace.help.tutorials.${id}.title`)}
                </h2>
                <p className="m-0 text-[13px] leading-relaxed text-[var(--text-muted)]">{t(`studio.workspace.help.tutorials.${id}.summary`)}</p>
              </div>
              <details className="group/steps border-t border-[var(--border-subtle)]">
                <summary
                  className={clsx(
                    "flex cursor-pointer list-none items-center justify-between gap-2 px-5 py-3 text-[12px] font-bold uppercase tracking-[var(--tracking-wide)] text-[var(--text-primary)] hover:bg-[var(--surface-brand-wash)] [&::-webkit-details-marker]:hidden",
                    focusRing,
                    "focus-visible:-outline-offset-2",
                  )}
                >
                  {t("studio.workspace.help.showSteps")}
                  <ChevronDown size={15} aria-hidden="true" className="transition-transform duration-[var(--duration-fast)] group-open/steps:rotate-180" />
                </summary>
                <ol className="m-0 grid gap-2 px-5 pb-5 pt-1 text-[13px] leading-relaxed text-[var(--text-body)]">
                  {(t(`studio.workspace.help.tutorials.${id}.steps`, { returnObjects: true }) as string[]).map((step, k) => (
                    <li key={k} className="ml-4 pl-1 marker:font-bold marker:text-[var(--gt-blue-600)]">
                      {step}
                    </li>
                  ))}
                </ol>
              </details>
            </article>
          </li>
        ))}
      </ol>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section aria-labelledby="gt-help-faq" className="grid content-start gap-3">
          <h2 id="gt-help-faq" className="m-0 text-[length:var(--text-h4)] font-[var(--weight-black)] text-[var(--text-primary)]">
            {t("studio.workspace.help.faqTitle")}
          </h2>
          <div className="grid divide-y divide-[var(--border-subtle)] rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-card)]">
            {FAQ.map((id) => (
              <details key={id} className="group/faq">
                <summary
                  className={clsx(
                    "flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-[14px] font-bold text-[var(--text-primary)] [&::-webkit-details-marker]:hidden",
                    focusRing,
                    "focus-visible:-outline-offset-2",
                  )}
                >
                  {t(`studio.workspace.hints.${id}.question`)}
                  <ChevronDown size={16} aria-hidden="true" className="flex-none transition-transform duration-[var(--duration-fast)] group-open/faq:rotate-180" />
                </summary>
                <p className="m-0 px-5 pb-5 text-[13.5px] leading-relaxed text-[var(--text-muted)]">{t(`studio.workspace.hints.${id}.answer`)}</p>
              </details>
            ))}
          </div>
        </section>

        <section aria-labelledby="gt-help-keys" className="grid content-start gap-3">
          <h2 id="gt-help-keys" className="m-0 flex items-center gap-2 text-[length:var(--text-h4)] font-[var(--weight-black)] text-[var(--text-primary)]">
            <Keyboard size={18} aria-hidden="true" className="text-[var(--gt-blue-600)]" />
            {t("studio.workspace.help.shortcutsTitle")}
          </h2>
          <dl className="m-0 grid gap-0 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-card)] px-5 py-2">
            {SHORTCUTS.map(({ keys, id }) => (
              <div key={id} className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] py-2.5 last:border-b-0">
                <dt className="text-[13px] text-[var(--text-body)]">{t(`studio.workspace.help.shortcuts.${id}`)}</dt>
                <dd className="m-0 flex flex-none gap-1">
                  {keys.map((k) => (
                    <kbd
                      key={k}
                      className="rounded-[6px] border border-[var(--border-default)] border-b-2 bg-[var(--surface-page)] px-1.5 py-0.5 font-[inherit] text-[11px] font-bold text-[var(--text-primary)]"
                    >
                      {k}
                    </kbd>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
          <div className="mt-2 grid gap-2 rounded-[var(--radius-lg)] bg-[var(--surface-brand-wash)] p-5">
            <p className="m-0 text-[14px] font-bold text-[var(--text-primary)]">{t("studio.workspace.help.feedbackTitle")}</p>
            <p className="m-0 text-[13px] leading-relaxed text-[var(--text-muted)]">{t("studio.workspace.help.feedbackBody")}</p>
            <Button
              variant="dark"
              size="sm"
              iconLeft={MessageSquareHeart}
              className="mt-1 justify-self-start"
              onClick={() => openWorkspaceDialog({ kind: "feedback" })}
            >
              {t("studio.workspace.nav.feedback")}
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
