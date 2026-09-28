import { describe, expect, it } from "vitest";
import { parseInline, parseRichText } from "./richText";
import { toggleInlineMarker, toggleList } from "./richTextEditing";

const text = (value: string) => ({ type: "text", text: value });

describe("parseRichText", () => {
  it("keeps single line breaks inside a paragraph and splits on blank lines", () => {
    expect(parseRichText("Line one\r\nLine two\r\n\r\nNext paragraph")).toEqual([
      { type: "paragraph", lines: [[text("Line one")], [text("Line two")]] },
      { type: "paragraph", lines: [[text("Next paragraph")]] },
    ]);
  });

  it("reads plain text written before formatting existed as one paragraph", () => {
    expect(parseRichText("Cristal Swarovski, 2 mm.")).toEqual([
      { type: "paragraph", lines: [[text("Cristal Swarovski, 2 mm.")]] },
    ]);
  });

  it("parses bullet and numbered lists, even straight after a paragraph", () => {
    expect(parseRichText("Contents:\n- one\n* **two**\n\n3. three\n4) four")).toEqual([
      { type: "paragraph", lines: [[text("Contents:")]] },
      { type: "list", ordered: false, items: [[text("one")], [{ type: "strong", children: [text("two")] }]] },
      { type: "list", ordered: true, start: 3, items: [[text("three")], [text("four")]] },
    ]);
  });

  it("starts a new list when the kind changes", () => {
    const blocks = parseRichText("- a\n1. b");
    expect(blocks.map((b) => b.type === "list" && b.ordered)).toEqual([false, true]);
  });

  it("does not read an italic line as a bullet", () => {
    expect(parseRichText("*soft* finish")[0].type).toBe("paragraph");
  });

  it("returns nothing for an empty description", () => {
    expect(parseRichText(" \n\n ")).toEqual([]);
  });
});

describe("parseInline", () => {
  it("parses bold and italic, nested either way", () => {
    expect(parseInline("a **b *c*** and *d **e** f* _g_")).toEqual([
      text("a "),
      { type: "strong", children: [text("b "), { type: "em", children: [text("c")] }] },
      text(" and "),
      { type: "em", children: [text("d "), { type: "strong", children: [text("e")] }, text(" f")] },
      text(" "),
      { type: "em", children: [text("g")] },
    ]);
  });

  it("leaves unmatched or spaced markers literal", () => {
    expect(parseInline("5* rating")).toEqual([text("5* rating")]);
    expect(parseInline("a ** b")).toEqual([text("a ** b")]);
    expect(parseInline("** not bold **")).toEqual([text("** not bold **")]);
    expect(parseInline("2 * 3 * 4")).toEqual([text("2 * 3 * 4")]);
  });

  it("ignores underscores inside words", () => {
    expect(parseInline("gem_size_2")).toEqual([text("gem_size_2")]);
  });

  it("honours escaped markers", () => {
    expect(parseInline("\\*not italic\\*")).toEqual([text("*not italic*")]);
  });

  it("keeps markup-looking text as text", () => {
    expect(parseInline("<script>alert(1)</script>")).toEqual([text("<script>alert(1)</script>")]);
  });
});

describe("toggleInlineMarker", () => {
  it("wraps the selection, leaving surrounding spaces outside", () => {
    const value = "a gem here";
    expect(toggleInlineMarker(value, 1, 6, "**")).toEqual({ value: "a **gem** here", selectionStart: 4, selectionEnd: 7 });
  });

  it("inserts an empty pair at the cursor", () => {
    expect(toggleInlineMarker("ab", 1, 1, "*")).toEqual({ value: "a**b", selectionStart: 2, selectionEnd: 2 });
  });

  it("unwraps a selection wrapped from outside or inside", () => {
    expect(toggleInlineMarker("a **gem** b", 4, 7, "**").value).toBe("a gem b");
    expect(toggleInlineMarker("a **gem** b", 2, 9, "**").value).toBe("a gem b");
  });

  it("tells italic apart from bold when unwrapping", () => {
    // Italic over a bold word adds a marker instead of eating the bold one.
    expect(toggleInlineMarker("**gem**", 2, 5, "*").value).toBe("***gem***");
    expect(toggleInlineMarker("***gem***", 3, 6, "*").value).toBe("**gem**");
    expect(toggleInlineMarker("***gem***", 3, 6, "**").value).toBe("*gem*");
  });

  it("wraps a multi-line selection line by line, after list prefixes", () => {
    const value = "- one\n\n- two";
    expect(toggleInlineMarker(value, 0, value.length, "**").value).toBe("- **one**\n\n- **two**");
  });
});

describe("toggleList", () => {
  it("turns the selected lines into a bullet list and back", () => {
    const on = toggleList("one\ntwo", 0, 7, false);
    expect(on.value).toBe("- one\n- two");
    expect(toggleList(on.value, 0, on.value.length, false).value).toBe("one\ntwo");
  });

  it("numbers lines and switches kinds without stacking prefixes", () => {
    expect(toggleList("- one\n\n- two", 0, 12, true).value).toBe("1. one\n\n2. two");
  });

  it("only touches the lines the selection reaches", () => {
    const value = "intro\none\ntwo\noutro";
    expect(toggleList(value, 6, 10, false).value).toBe("intro\n- one\ntwo\noutro");
  });

  it("starts a list on an empty line with the cursor after the prefix", () => {
    expect(toggleList("text\n", 5, 5, false)).toEqual({ value: "text\n- ", selectionStart: 7, selectionEnd: 7 });
  });
});
