import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Bold, Heading3, Italic, Link2, List, ListOrdered, Pilcrow, type LucideIcon } from "lucide-react";
import clsx from "clsx";

/**
 * The text block's editor.
 *
 * A `contentEditable` surface driven by `document.execCommand`. The command API
 * is deprecated, and in production this is where a proper editor (TipTap,
 * Lexical) would go; for a prototype it is the option that gives real
 * formatting — headings, lists, links — without adding a large dependency the
 * project would then have to live with.
 *
 * The surface is deliberately *uncontrolled* after mount. Writing React state
 * back into `innerHTML` on every keystroke destroys and rebuilds the DOM the
 * caret lives in, which sends the cursor to the start of the block on every
 * character typed. So the HTML is seeded once per block and per language, and
 * flows one way from there: editor → state.
 *
 * The HTML rendered here is authored in this screen and never leaves the
 * browser; there is no untrusted source to sanitise in the prototype. Wiring
 * this to stored content is the point at which sanitising becomes mandatory.
 */

interface Command {
  id: string;
  labelKey: string;
  icon: LucideIcon;
  run: () => void;
}

export function RichTextEditor({
  html,
  onChange,
  /** Re-seeds the surface when the edited block or language changes. */
  seedKey,
  label,
  describedBy,
}: {
  html: string;
  onChange: (html: string) => void;
  seedKey: string;
  label: string;
  describedBy?: string;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== html) ref.current.innerHTML = html;
    // Only on a change of block or language: see the note above on why `html`
    // is not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedKey]);

  const exec = (command: string, value?: string) => {
    ref.current?.focus();
    document.execCommand(command, false, value);
    if (ref.current) onChange(ref.current.innerHTML);
  };

  const commands: Command[] = [
    { id: "h3", labelKey: "heading", icon: Heading3, run: () => exec("formatBlock", "<h3>") },
    { id: "p", labelKey: "paragraph", icon: Pilcrow, run: () => exec("formatBlock", "<p>") },
    { id: "bold", labelKey: "bold", icon: Bold, run: () => exec("bold") },
    { id: "italic", labelKey: "italic", icon: Italic, run: () => exec("italic") },
    { id: "ul", labelKey: "bulleted", icon: List, run: () => exec("insertUnorderedList") },
    { id: "ol", labelKey: "numbered", icon: ListOrdered, run: () => exec("insertOrderedList") },
    {
      id: "link",
      labelKey: "link",
      icon: Link2,
      run: () => {
        const url = window.prompt(t("admin.training.blocks.linkPrompt"), "https://");
        if (url) exec("createLink", url);
      },
    },
  ];

  return (
    <div
      className={clsx(
        "rounded-[var(--admin-radius-sm)] border transition-colors",
        focused ? "border-[var(--focus-ring)] shadow-[var(--shadow-focus)]" : "border-[var(--border-default)]",
      )}
    >
      <div
        role="toolbar"
        aria-label={t("admin.training.blocks.textContent")}
        className="flex flex-wrap items-center gap-0.5 border-b border-[var(--border-subtle)] bg-[var(--admin-panel-sunken)] p-1"
      >
        {commands.map((command) => (
          <button
            key={command.id}
            type="button"
            // Mousedown would move focus out of the editable surface and drop
            // the selection the command is meant to act on.
            onMouseDown={(e) => e.preventDefault()}
            onClick={command.run}
            aria-label={t(`admin.training.blocks.${command.labelKey}`)}
            title={t(`admin.training.blocks.${command.labelKey}`)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-[var(--radius-xs)] text-[var(--text-muted)] transition-colors hover:bg-[var(--gt-ink-100)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
          >
            <command.icon size={14} strokeWidth={2} aria-hidden="true" />
          </button>
        ))}
      </div>

      <div
        ref={ref}
        role="textbox"
        aria-multiline="true"
        aria-label={label}
        aria-describedby={describedBy}
        contentEditable
        suppressContentEditableWarning
        onInput={(e) => onChange(e.currentTarget.innerHTML)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="gt-rich-text min-h-[140px] px-3 py-2.5 text-[length:var(--text-body-sm)] leading-[var(--leading-normal)] text-[var(--text-body)] focus:outline-none"
      />
    </div>
  );
}

/** Read-only rendering of a text block, used by the previews. */
export function RichTextView({ html, className }: { html: string; className?: string }) {
  return <div className={clsx("gt-rich-text", className)} dangerouslySetInnerHTML={{ __html: html }} />;
}
