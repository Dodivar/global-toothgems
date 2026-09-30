import { useState } from "react";
import clsx from "clsx";
import { CircleHelp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { EditorPopover } from "../editor/EditorPopover";
import { focusRing } from "./workspaceStyles";

/** The questions the workspace answers in place, each under `studio.workspace.hints.<id>`. */
export type HintId = "saving" | "groups" | "estimate";

/**
 * A small "?" beside a complex control that opens a short answer. Opened on
 * click (never hover-only), closed by Escape or a press outside, so the
 * explanation is there when wanted and out of the way otherwise.
 */
export function HelpHint({ id, align = "start", className }: { id: HintId; align?: "start" | "end"; className?: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const question = t(`studio.workspace.hints.${id}.question`);

  return (
    <EditorPopover
      label={question}
      open={open}
      onOpenChange={setOpen}
      width={290}
      align={align}
      trigger={(props) => (
        <button
          type="button"
          {...props}
          aria-label={question}
          title={question}
          className={clsx(
            "inline-grid h-6 w-6 flex-none place-items-center rounded-full text-[var(--text-subtle)] transition-colors hover:bg-[var(--gt-blue-100)] hover:text-[var(--gt-blue-700)]",
            open && "bg-[var(--gt-blue-100)] text-[var(--gt-blue-700)]",
            focusRing,
            className,
          )}
        >
          <CircleHelp size={14} aria-hidden="true" />
        </button>
      )}
    >
      <div className="grid gap-1.5 p-2.5">
        <p className="m-0 text-[13px] font-bold text-[var(--text-primary)]">{question}</p>
        <p className="m-0 text-[12.5px] leading-relaxed text-[var(--text-muted)]">{t(`studio.workspace.hints.${id}.answer`)}</p>
      </div>
    </EditorPopover>
  );
}
