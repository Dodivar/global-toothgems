import { describe, expect, it } from "vitest";
import { isSafeHref, parseInline, parseRichText } from "./richText";

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

  it("parses headings, quotes and separators", () => {
    expect(parseRichText("## Title\n### Sub\n> one\n> **two**\n\n---\nafter")).toEqual([
      { type: "heading", level: 2, content: [text("Title")] },
      { type: "heading", level: 3, content: [text("Sub")] },
      { type: "quote", lines: [[text("one")], [{ type: "strong", children: [text("two")] }]] },
      { type: "rule" },
      { type: "paragraph", lines: [[text("after")]] },
    ]);
  });

  it("reads escaped block markers as text", () => {
    expect(parseRichText("\\- no\n1\\. no\n\\## no\n\\> no")).toEqual([
      { type: "paragraph", lines: [[text("- no")], [text("1. no")], [text("## no")], [text("> no")]] },
    ]);
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

  it("parses underline, strikethrough and links", () => {
    expect(parseInline("++u++ ~~s~~ [site](https://example.com/a) C++ and ~ 3 mm")).toEqual([
      { type: "underline", children: [text("u")] },
      text(" "),
      { type: "strike", children: [text("s")] },
      text(" "),
      { type: "link", href: "https://example.com/a", children: [text("site")] },
      text(" C++ and ~ 3 mm"),
    ]);
  });

  it("keeps a link with a refused address as plain text", () => {
    expect(parseInline("[x](javascript:alert(1))")).toEqual([text("[x](javascript:alert(1))")]);
    expect(parseInline("[x](//evil.example)")).toEqual([text("[x](//evil.example)")]);
  });

  it("keeps markup-looking text as text", () => {
    expect(parseInline("<script>alert(1)</script>")).toEqual([text("<script>alert(1)</script>")]);
  });
});

describe("isSafeHref", () => {
  it("accepts web, e-mail and site links only", () => {
    expect(isSafeHref("https://example.com")).toBe(true);
    expect(isSafeHref("mailto:hello@example.com")).toBe(true);
    expect(isSafeHref("/produits/etoile")).toBe(true);
    expect(isSafeHref("javascript:alert(1)")).toBe(false);
    expect(isSafeHref("data:text/html,x")).toBe(false);
    expect(isSafeHref("//evil.example")).toBe(false);
    expect(isSafeHref("https://")).toBe(false);
  });
});
