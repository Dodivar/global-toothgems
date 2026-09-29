import { useEffect, useLayoutEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  Bold,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Redo2,
  RemoveFormatting,
  SeparatorHorizontal,
  Strikethrough,
  TextQuote,
  Underline,
  Undo2,
  Unlink,
  type LucideIcon,
} from "lucide-react";
import clsx from "clsx";
import { AdminIconButton } from "./AdminIconButton";
import { isSafeHref, parseRichText } from "../../lib/richText";
import { fillEditor, readEditorBlocks, serializeRichText } from "../../lib/richTextSerialize";

/**
 * Formatted editor for the product description: the administrator sees the
 * text as the shop will show it while typing, with no separate preview.
 *
 * The stored value is still the Markdown subset of `lib/richText.ts`, which
 * the storefront renders without ever injecting HTML. The editing surface is a
 * `contentEditable` driven by `document.execCommand` — the same approach as
 * the lesson text editor (`training/RichTextEditor.tsx`), for the same reason:
 * real formatting without a large editor dependency. Every change is read back
 * from the DOM and serialised (`lib/richTextSerialize.ts`), so only what the
 * shop can render is ever saved.
 *
 * The surface is uncontrolled while the administrator types: rewriting it on
 * every keystroke would throw the caret to the start. It is rebuilt only when
 * `value` changes from outside — the content language switched, the product
 * loaded — and it is then remounted, so the browser's undo history does not
 * reach back into the other language.
 */
interface RichTextAreaProps {
  /** From `FormField`, whose label carries `${id}-label`. */
  id: string;
  "aria-describedby": string | undefined;
  "aria-invalid": boolean | undefined;
  "aria-required": boolean | undefined;
  value: string;
  onValueChange: (value: string) => void;
  rows?: number;
}

type BlockKind = "h2" | "h3" | "blockquote" | "ul" | "ol" | null;

interface ActiveFormats {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  link: boolean;
  block: BlockKind;
}

/** Commands that restructure lines without meaning to move the caret. */
const BLOCK_COMMANDS = new Set(["formatBlock", "insertUnorderedList", "insertOrderedList"]);

const NO_FORMATS: ActiveFormats = { bold: false, italic: false, underline: false, strike: false, link: false, block: null };

interface Tool {
  id: string;
  icon: LucideIcon;
  label: string;
  run: () => void;
  pressed?: boolean;
}

export function RichTextArea({ value, onValueChange, rows = 8, id, ...ariaProps }: RichTextAreaProps) {
  const { t } = useTranslation();
  const editorRef = useRef<HTMLDivElement>(null);
  /** The last Markdown this editor produced, or the value it was seeded with. */
  const emitted = useRef(value);
  /** Where the caret was, so a toolbar button acts on it after taking focus. */
  const savedRange = useRef<Range | null>(null);
  const [seed, setSeed] = useState(0);
  const [active, setActive] = useState<ActiveFormats>(NO_FORMATS);

  useLayoutEffect(() => {
    if (value === emitted.current) return;
    emitted.current = value;
    setSeed((current) => current + 1);
  }, [value]);

  useLayoutEffect(() => {
    if (!editorRef.current) return;
    fillEditor(editorRef.current, parseRichText(emitted.current));
    savedRange.current = null;
    setActive(NO_FORMATS);
  }, [seed]);

  useEffect(() => {
    const onSelectionChange = () => {
      const editor = editorRef.current;
      const selection = document.getSelection();
      if (!editor || !selection || selection.rangeCount === 0) return;
      const range = selection.getRangeAt(0);
      if (!editor.contains(range.commonAncestorContainer)) return;
      savedRange.current = range.cloneRange();
      setActive(readActiveFormats(editor, range));
    };
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, []);

  const emit = () => {
    const editor = editorRef.current;
    if (!editor) return;
    tidyEditor(editor);
    const next = serializeRichText(readEditorBlocks(editor));
    if (next === emitted.current) return;
    emitted.current = next;
    onValueChange(next);
  };

  /** Puts focus and the caret back in the editor, runs `action`, saves. */
  const run = (action: () => void, keepCaret = false) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    const selection = document.getSelection();
    if (savedRange.current && selection) {
      selection.removeAllRanges();
      selection.addRange(savedRange.current);
    }
    // Block commands move the caret's text into new elements and leave the
    // caret at the start of the line; it is put back where it was.
    const caret = selection && selection.rangeCount > 0 ? snapshotSelection(editor, selection) : null;
    action();
    emit();
    if (caret && keepCaret) restoreSelection(editor, caret);
    const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
    if (range && editor.contains(range.commonAncestorContainer)) setActive(readActiveFormats(editor, range));
  };

  const exec = (command: string, argument?: string) =>
    run(() => document.execCommand(command, false, argument), BLOCK_COMMANDS.has(command));

  const toggleBlock = (kind: "h2" | "h3" | "blockquote") => exec("formatBlock", active.block === kind ? "<p>" : `<${kind}>`);

  const toggleLink = () => {
    const anchor = savedRange.current && closestInEditor(editorRef.current, savedRange.current.startContainer, "a");
    if (anchor) {
      // Unlinking a caret inside a link removes the whole link, not nothing.
      run(() => {
        const selection = document.getSelection();
        const range = document.createRange();
        range.selectNodeContents(anchor);
        selection?.removeAllRanges();
        selection?.addRange(range);
        document.execCommand("unlink");
      });
      return;
    }
    const input = window.prompt(t("admin.form.richText.linkPrompt"), "https://");
    if (!input) return;
    const href = withScheme(input.trim());
    if (!isSafeHref(href)) {
      window.alert(t("admin.form.richText.linkInvalid"));
      return;
    }
    // On a bare caret the browser inserts the address itself as the link text.
    exec("createLink", href);
  };

  const clearFormatting = () =>
    run(() => {
      document.execCommand("removeFormat");
      // Only when a link is selected: a second, empty command would take a
      // step of its own in the undo history.
      const range = document.getSelection()?.rangeCount ? document.getSelection()!.getRangeAt(0) : null;
      const links = editorRef.current?.querySelectorAll("a") ?? [];
      if (range && Array.from(links).some((link) => range.intersectsNode(link))) document.execCommand("unlink");
    });

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    // Bold, italic, underline, undo and redo are the browser's own shortcuts.
    const shortcuts: Record<string, () => void> = event.shiftKey
      ? { KeyX: () => exec("strikeThrough"), Digit7: () => exec("insertOrderedList"), Digit8: () => exec("insertUnorderedList") }
      : { KeyK: toggleLink };
    const shortcut = shortcuts[event.code];
    if (!shortcut) return;
    event.preventDefault();
    shortcut();
  };

  /**
   * Pasted content goes through the same reader as typed content: a
   * supplier's page keeps its bold, lists and links, but not its fonts,
   * colours or scripts.
   */
  const onPaste = (event: ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    const html = event.clipboardData.getData("text/html");
    const text = event.clipboardData.getData("text/plain");
    if (html) {
      const pasted = new DOMParser().parseFromString(html, "text/html").body;
      const blocks = readEditorBlocks(pasted);
      const clean = document.createElement("div");
      fillEditor(clean, blocks);
      exec("insertHTML", clean.innerHTML);
    } else if (text) {
      exec("insertText", text);
    }
  };

  const onFocus = () => {
    // Enter starts a `<p>`, which is what a blank line gives in the stored
    // text; Shift+Enter keeps its `<br>`, a line break inside the paragraph.
    document.execCommand("defaultParagraphSeparator", false, "p");
    document.execCommand("styleWithCSS", false, "false");
  };

  const groups: Tool[][] = [
    [
      { id: "undo", icon: Undo2, label: t("admin.form.richText.undo"), run: () => exec("undo") },
      { id: "redo", icon: Redo2, label: t("admin.form.richText.redo"), run: () => exec("redo") },
    ],
    [
      { id: "h2", icon: Heading2, label: t("admin.form.richText.heading"), run: () => toggleBlock("h2"), pressed: active.block === "h2" },
      { id: "h3", icon: Heading3, label: t("admin.form.richText.subheading"), run: () => toggleBlock("h3"), pressed: active.block === "h3" },
      { id: "quote", icon: TextQuote, label: t("admin.form.richText.quote"), run: () => toggleBlock("blockquote"), pressed: active.block === "blockquote" },
    ],
    [
      { id: "bold", icon: Bold, label: t("admin.form.richText.bold"), run: () => exec("bold"), pressed: active.bold },
      { id: "italic", icon: Italic, label: t("admin.form.richText.italic"), run: () => exec("italic"), pressed: active.italic },
      { id: "underline", icon: Underline, label: t("admin.form.richText.underline"), run: () => exec("underline"), pressed: active.underline },
      { id: "strike", icon: Strikethrough, label: t("admin.form.richText.strike"), run: () => exec("strikeThrough"), pressed: active.strike },
    ],
    [
      { id: "ul", icon: List, label: t("admin.form.richText.bulletList"), run: () => exec("insertUnorderedList"), pressed: active.block === "ul" },
      { id: "ol", icon: ListOrdered, label: t("admin.form.richText.numberedList"), run: () => exec("insertOrderedList"), pressed: active.block === "ol" },
    ],
    [
      active.link
        ? { id: "unlink", icon: Unlink, label: t("admin.form.richText.unlink"), run: () => toggleLink(), pressed: true }
        : { id: "link", icon: Link2, label: t("admin.form.richText.link"), run: () => toggleLink() },
      { id: "rule", icon: SeparatorHorizontal, label: t("admin.form.richText.rule"), run: () => exec("insertHorizontalRule") },
      { id: "clear", icon: RemoveFormatting, label: t("admin.form.richText.clear"), run: () => clearFormatting() },
    ],
  ];

  return (
    <div
      className={clsx(
        "overflow-hidden rounded-[var(--admin-radius-sm)] border bg-[var(--admin-panel)] transition-[border-color,box-shadow] duration-[var(--duration-fast)]",
        ariaProps["aria-invalid"]
          ? "border-[var(--status-error-fg)]"
          : "border-[var(--border-default)] hover:border-[var(--gt-ink-400)]",
        "focus-within:border-[var(--focus-ring)] focus-within:shadow-[var(--shadow-focus)]",
      )}
    >
      <div
        role="toolbar"
        aria-label={t("admin.form.richText.toolbar")}
        aria-controls={id}
        className="flex flex-wrap items-center gap-0.5 border-b border-[var(--border-subtle)] bg-[var(--admin-panel-sunken)] p-1"
      >
        {groups.map((group, index) => (
          <div key={index} className="flex items-center gap-0.5">
            {index > 0 && <span aria-hidden="true" className="mx-1 h-5 w-px bg-[var(--border-subtle)]" />}
            {group.map((tool) => (
              <AdminIconButton
                key={tool.id}
                size="sm"
                icon={tool.icon}
                label={tool.label}
                aria-pressed={tool.pressed}
                // Mousedown would take focus, and the selection with it, out
                // of the text the command is meant to act on.
                onMouseDown={(event) => event.preventDefault()}
                onClick={tool.run}
                className="aria-pressed:bg-[var(--gt-ink-900)] aria-pressed:text-[var(--text-inverse)] aria-pressed:hover:bg-[var(--gt-ink-700)]"
              />
            ))}
          </div>
        ))}
      </div>

      <div
        key={seed}
        ref={editorRef}
        id={id}
        role="textbox"
        aria-multiline="true"
        aria-labelledby={`${id}-label`}
        {...ariaProps}
        contentEditable
        suppressContentEditableWarning
        spellCheck
        onInput={emit}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onDrop={(event) => event.preventDefault()}
        onFocus={onFocus}
        style={{ minHeight: `${rows * 1.6 + 1.5}em` }}
        className="gt-rich-text max-h-[70vh] resize-y overflow-auto px-3 py-2.5 text-[length:var(--text-body-sm)] leading-[1.6] text-[var(--text-body)] outline-none"
      />
    </div>
  );
}

/**
 * Chrome's list command wraps the new `<ul>` inside the paragraph it came
 * from (`<p><ul>…</ul></p>`), which is not valid HTML and which the next
 * command builds on in odd ways. Such wrappers are unwrapped, and lists or
 * quotes left with nothing in them are removed, keeping the caret in place.
 */
function tidyEditor(editor: HTMLElement): void {
  const wrappers = Array.from(editor.querySelectorAll<HTMLElement>("p, div")).filter((element) =>
    Array.from(element.children).some((child) => /^(P|DIV|UL|OL|BLOCKQUOTE|H[1-6]|HR)$/.test(child.tagName)),
  );
  const empties = Array.from(editor.querySelectorAll<HTMLElement>("ul, ol")).filter((list) => !list.querySelector("li"));
  if (!wrappers.length && !empties.length) return;

  const selection = document.getSelection();
  const caret = selection && selection.rangeCount > 0 ? snapshotSelection(editor, selection) : null;
  for (const list of empties) {
    const parent = list.parentElement;
    list.remove();
    if (parent && parent !== editor && parent.tagName === "BLOCKQUOTE" && !parent.firstChild) parent.remove();
  }
  // Innermost first, so a wrapper inside a wrapper is handled before its parent.
  for (const wrapper of wrappers.reverse()) {
    if (wrapper.isConnected) wrapper.replaceWith(...Array.from(wrapper.childNodes));
  }
  if (caret) restoreSelection(editor, caret);
}

/**
 * A selection end recorded as "character `offset` of the editor's `index`-th
 * text node": Chrome's block commands replace the caret's text node with a
 * copy, so the node itself cannot be kept, but the order of text nodes and
 * their content do not change.
 */
interface SelectionPoint {
  node: Node;
  index: number;
  offset: number;
}

interface SelectionSnapshot {
  anchor: SelectionPoint;
  focus: SelectionPoint;
}

function textNodes(editor: HTMLElement): Node[] {
  const walker = editor.ownerDocument.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  const nodes: Node[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node);
  return nodes;
}

function snapshotSelection(editor: HTMLElement, selection: Selection): SelectionSnapshot | null {
  const { anchorNode, anchorOffset, focusNode, focusOffset } = selection;
  if (!anchorNode || !focusNode || !editor.contains(anchorNode) || !editor.contains(focusNode)) return null;
  const nodes = textNodes(editor);
  return {
    anchor: { node: anchorNode, index: nodes.indexOf(anchorNode), offset: anchorOffset },
    focus: { node: focusNode, index: nodes.indexOf(focusNode), offset: focusOffset },
  };
}

/** Puts a selection back on its nodes, or on their copies if they were replaced. */
function restoreSelection(editor: HTMLElement, snapshot: SelectionSnapshot): void {
  const nodes = textNodes(editor);
  const resolve = ({ node, index, offset }: SelectionPoint): [Node, number] | null => {
    const target = editor.contains(node) ? node : index >= 0 ? nodes[index] : undefined;
    if (!target) return null;
    const size = target.nodeType === Node.TEXT_NODE ? (target.nodeValue ?? "").length : target.childNodes.length;
    return offset <= size ? [target, offset] : null;
  };
  const anchor = resolve(snapshot.anchor);
  const focus = resolve(snapshot.focus);
  if (anchor && focus) document.getSelection()?.setBaseAndExtent(anchor[0], anchor[1], focus[0], focus[1]);
}

function readActiveFormats(editor: HTMLElement, range: Range): ActiveFormats {
  const at = range.startContainer;
  const block = closestInEditor(editor, at, "h1, h2, h3, h4, h5, h6, blockquote, ul, ol");
  const tag = block?.tagName.toLowerCase();
  return {
    bold: document.queryCommandState("bold"),
    italic: document.queryCommandState("italic"),
    underline: document.queryCommandState("underline"),
    strike: document.queryCommandState("strikeThrough"),
    link: closestInEditor(editor, at, "a") !== null,
    block: tag === "h1" || tag === "h2" ? "h2" : tag?.startsWith("h") ? "h3" : ((tag as BlockKind | undefined) ?? null),
  };
}

function closestInEditor(editor: HTMLElement | null, node: Node, selector: string): HTMLElement | null {
  const element = node instanceof Element ? node : node.parentElement;
  const found = element?.closest<HTMLElement>(selector) ?? null;
  return found && editor && editor !== found && editor.contains(found) ? found : null;
}

/** `boutique.fr/page` → `https://boutique.fr/page`; `a@b.fr` → `mailto:a@b.fr`. */
function withScheme(input: string): string {
  if (/^[a-z][a-z\d+.-]*:/i.test(input) || input.startsWith("/")) return input;
  if (/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(input)) return `mailto:${input}`;
  return `https://${input}`;
}
