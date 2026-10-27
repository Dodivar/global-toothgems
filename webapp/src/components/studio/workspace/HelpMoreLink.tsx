import clsx from "clsx";
import { ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { studioHelpPath, type HelpTopicId } from "../../../lib/studioWorkspace/helpTopics";
import { useOpenStudioHelp } from "./useOpenStudioHelp";
import { focusRing } from "./workspaceStyles";

/**
 * "Read the full help": the way from a short explanation bubble to its topic
 * on the help page. A real link (it can open in a new tab), followed in place
 * by a plain click.
 */
export function HelpMoreLink({ topic, className }: { topic: HelpTopicId; className?: string }) {
  const { t } = useTranslation();
  const openHelp = useOpenStudioHelp();
  return (
    <a
      href={studioHelpPath(topic)}
      onClick={(event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        openHelp(topic);
      }}
      className={clsx(
        "inline-flex items-center gap-1 rounded-[4px] text-[12px] font-bold normal-case tracking-normal text-[var(--gt-blue-700)] underline-offset-2 hover:underline",
        focusRing,
        className,
      )}
    >
      {t("studio.workspace.help.readMore")}
      <ArrowRight size={13} aria-hidden="true" />
    </a>
  );
}
