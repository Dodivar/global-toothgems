import { BULLET_PATTERN, ORDERED_PATTERN } from "./richText";

/**
 * Text transformations behind the description editor's toolbar.
 *
 * Each takes the textarea's value and selection and returns the new value
 * with the selection to restore, so the buttons only insert the same markers
 * an administrator could type by hand (see `richText.ts`).
 */

export interface TextEdit {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

export type InlineMarker = "**" | "*";

const LIST_PREFIX = /^\s*(?:[-*•]|\d{1,4}[.)])\s+/;

/**
 * Wraps the selection in `marker`, or removes it when the selection is
 * already wrapped. Surrounding spaces stay outside the markers — `** bold**`
 * would not render — and a selection over several lines is wrapped line by
 * line, since emphasis never spans a line break.
 */
export function toggleInlineMarker(value: string, start: number, end: number, marker: InlineMarker): TextEdit {
  const [from, to] = trimRange(value, start, end);

  if (value.slice(from, to).includes("\n")) {
    const wrapped = value
      .slice(from, to)
      .split("\n")
      .map((line) => {
        const prefix = LIST_PREFIX.exec(line)?.[0] ?? /^\s*/.exec(line)![0];
        const core = line.slice(prefix.length).trimEnd();
        return core ? `${prefix}${marker}${core}${marker}${line.slice(prefix.length + core.length)}` : line;
      })
      .join("\n");
    return { value: value.slice(0, from) + wrapped + value.slice(to), selectionStart: from, selectionEnd: from + wrapped.length };
  }

  // Already wrapped from the outside: `**|word|**`.
  if (wrappedBy(value, from, to, marker)) {
    const m = marker.length;
    return {
      value: value.slice(0, from - m) + value.slice(from, to) + value.slice(to + m),
      selectionStart: from - m,
      selectionEnd: to - m,
    };
  }

  // Selection includes its own markers: `|**word**|`.
  const selected = value.slice(from, to);
  const m = marker.length;
  if (selected.length > 2 * m && wrappedBy(selected, m, selected.length - m, marker)) {
    const inner = selected.slice(m, -m);
    return { value: value.slice(0, from) + inner + value.slice(to), selectionStart: from, selectionEnd: from + inner.length };
  }

  return {
    value: value.slice(0, from) + marker + selected + marker + value.slice(to),
    selectionStart: from + m,
    selectionEnd: to + m,
  };
}

/**
 * Turns the lines touched by the selection into a bullet or numbered list,
 * or back into plain lines when they already are that kind of list. Switching
 * between the two kinds replaces the prefix rather than stacking both.
 */
export function toggleList(value: string, start: number, end: number, ordered: boolean): TextEdit {
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  // A selection ending right after a line break does not touch the next line.
  const lastChar = end > start && value[end - 1] === "\n" ? end - 1 : end;
  const nextBreak = value.indexOf("\n", lastChar);
  const lineEnd = nextBreak === -1 ? value.length : nextBreak;

  const lines = value.slice(lineStart, lineEnd).split("\n");
  const pattern = ordered ? ORDERED_PATTERN : BULLET_PATTERN;
  const filled = lines.filter((line) => line.trim() !== "");
  const removing = filled.length > 0 && filled.every((line) => pattern.test(line));

  let counter = 0;
  const next = lines.map((line) => {
    const bare = line.replace(LIST_PREFIX, "");
    if (removing) return bare;
    // Blank lines inside a multi-line selection stay blank; a single empty
    // line gets a prefix so the administrator can start typing the list.
    if (line.trim() === "" && lines.length > 1) return line;
    counter += 1;
    return `${ordered ? `${counter}.` : "-"} ${bare.trimStart()}`;
  });

  const block = next.join("\n");
  const collapsed = start === end && lines.length === 1;
  const blockEnd = lineStart + block.length;
  return {
    value: value.slice(0, lineStart) + block + value.slice(lineEnd),
    selectionStart: collapsed ? blockEnd : lineStart,
    selectionEnd: blockEnd,
  };
}

function trimRange(value: string, start: number, end: number): [number, number] {
  let from = start;
  let to = end;
  while (from < to && /\s/.test(value[from])) from += 1;
  while (to > from && /\s/.test(value[to - 1])) to -= 1;
  return [from, to];
}

/**
 * Whether `from..to` sits between two `marker`s. Star runs are counted so
 * that italic inside bold (`***word***`) and bold alone (`**word**`) are told
 * apart: a run of 3 carries both markers, a run of 2 only the bold one.
 */
function wrappedBy(text: string, from: number, to: number, marker: InlineMarker): boolean {
  let before = 0;
  while (text[from - 1 - before] === "*") before += 1;
  let after = 0;
  while (text[to + after] === "*") after += 1;
  const run = Math.min(before, after);
  return marker === "**" ? run === 2 || run === 3 : run === 1 || run === 3;
}
