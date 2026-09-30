import { describe, expect, it } from "vitest";
import { parseRichText, type RichBlock, type RichInline } from "./richText";
import { readEditorBlocks, serializeInline, serializeRichText, type EditorNode } from "./richTextSerialize";

const text = (value: string): RichInline => ({ type: "text", text: value });

// Minimal stand-ins for DOM nodes: the test runner has no DOM.
const t = (value: string): EditorNode => ({ nodeType: 3, nodeName: "#text", nodeValue: value, childNodes: [] });
const h = (tag: string, attrs: Record<string, string> | EditorNode[] = [], kids: EditorNode[] = []): EditorNode => {
  const attributes = Array.isArray(attrs) ? {} : attrs;
  const childNodes = Array.isArray(attrs) ? attrs : kids;
  return { nodeType: 1, nodeName: tag.toUpperCase(), nodeValue: null, childNodes, getAttribute: (name) => attributes[name] ?? null };
};
const root = (...kids: EditorNode[]) => h("div", kids);

const roundTrip = (source: string) => serializeRichText(parseRichText(source));

describe("serializeRichText", () => {
  it("writes every block kind back to the syntax it was parsed from", () => {
    const source = [
      "## Title",
      "### Sub",
      "Line one\nLine **two**",
      "> quoted\n> again",
      "---",
      "- a\n- b",
      "3. c\n4. d",
      "++under++ ~~gone~~ [site](https://example.com)",
    ].join("\n\n");
    expect(roundTrip(source)).toBe(source);
  });

  it("keeps an existing plain description unchanged", () => {
    const source = "Lot de 10 cristaux SWAROVSKI® en forme de baguette.\n\nCouleur crystal shimmer\nDimensions : 3,7 × 1,9 mm";
    expect(roundTrip(source)).toBe(source);
  });

  it("escapes characters that would otherwise turn into formatting", () => {
    const blocks: RichBlock[] = [
      { type: "paragraph", lines: [[text("5* rating, C++, ~2 mm, [draft] gem_size")], [text("- not a bullet")], [text("1. not a list")], [text("## not a title")], [text("---")]] },
    ];
    const markdown = serializeRichText(blocks);
    expect(parseRichText(markdown)).toEqual([
      { type: "paragraph", lines: [[text("5* rating, C++, ~2 mm, [draft] gem_size")], [text("- not a bullet")], [text("1. not a list")], [text("## not a title")], [text("---")]] },
    ]);
  });

  it("drops empty lines, items and headings", () => {
    expect(
      serializeRichText([
        { type: "paragraph", lines: [[], [text(" ")], [text("kept")], []] },
        { type: "heading", level: 2, content: [] },
        { type: "list", ordered: false, items: [[], [text("item")]] },
      ]),
    ).toBe("kept\n\n- item");
  });
});

describe("serializeInline", () => {
  it("moves spaces outside the markers, where the parser expects them", () => {
    expect(serializeInline([text("a"), { type: "strong", children: [text(" bold ")] }, text("b")])).toBe("a **bold** b");
  });

  it("merges adjacent runs and nested duplicates", () => {
    const nodes: RichInline[] = [
      { type: "strong", children: [text("a")] },
      { type: "strong", children: [{ type: "strong", children: [text("b")] }] },
    ];
    expect(serializeInline(nodes)).toBe("**ab**");
  });

  it("uses `_` for italic next to bold, and `*` inside a word", () => {
    const beside: RichInline[] = [{ type: "em", children: [{ type: "strong", children: [text("a")] }, text(" b")] }];
    expect(serializeInline(beside)).toBe("_**a** b_");
    expect(parseRichText(serializeInline(beside))).toEqual([{ type: "paragraph", lines: [beside] }]);
    expect(serializeInline([text("super"), { type: "em", children: [text("fin")] }, text("e")])).toBe("super*fin*e");
  });

  it("encodes characters that would end the link target early", () => {
    expect(serializeInline([{ type: "link", href: "https://x.test/a (b)", children: [text("x")] }])).toBe("[x](https://x.test/a%20%28b%29)");
  });
});

describe("readEditorBlocks", () => {
  it("reads paragraphs, soft line breaks and inline formatting", () => {
    const dom = root(
      h("p", [t("Couleur "), h("b", [t("crystal")]), h("br"), t("Dimensions : 3,7 mm"), h("br")]),
      h("p", [h("i", [t("soft")]), t(" "), h("u", [t("u")]), t(" "), h("strike", [t("s")])]),
    );
    expect(serializeRichText(readEditorBlocks(dom))).toBe("Couleur **crystal**\nDimensions : 3,7 mm\n\n_soft_ ++u++ ~~s~~");
  });

  it("reads headings, quotes, rules and lists", () => {
    const dom = root(
      h("h2", [t("Title")]),
      h("h3", [t("Sub")]),
      h("blockquote", [t("one"), h("br"), t("two")]),
      h("hr"),
      h("ul", [h("li", [t("a")]), h("li", [t("b"), h("ul", [h("li", [t("nested")])])])]),
      h("ol", { start: "3" }, [h("li", [t("c")])]),
    );
    expect(serializeRichText(readEditorBlocks(dom))).toBe("## Title\n\n### Sub\n\n> one\n> two\n\n---\n\n- a\n- b\n- nested\n\n3. c");
  });

  it("keeps safe links and drops unsafe ones", () => {
    const dom = root(
      h("p", [h("a", { href: "https://example.com" }, [t("ok")]), t(" "), h("a", { href: "javascript:alert(1)" }, [t("bad")])]),
    );
    expect(serializeRichText(readEditorBlocks(dom))).toBe("[ok](https://example.com) bad");
  });

  it("reads bold and italic written as styles, and ignores the rest", () => {
    const dom = root(
      h("div", [
        h("span", { style: "font-weight: 700; color: red" }, [t("b")]),
        h("span", { style: "font-style: italic" }, [t("i")]),
        h("font", { color: "red" }, [t("plain")]),
      ]),
    );
    const markdown = serializeRichText(readEditorBlocks(dom));
    expect(markdown).toBe("**b***i*plain");
    expect(parseRichText(markdown)).toEqual([
      { type: "paragraph", lines: [[{ type: "strong", children: [text("b")] }, { type: "em", children: [text("i")] }, text("plain")]] },
    ]);
  });

  it("treats loose text and nested blocks the way the browser lays them out", () => {
    const dom = root(t("loose"), h("div", [h("p", [t("inner")]), h("div", [t("second")])]));
    expect(serializeRichText(readEditorBlocks(dom))).toBe("loose\n\ninner\n\nsecond");
  });

  it("ignores scripts and styles in pasted content", () => {
    const dom = root(h("p", [t("kept"), h("script", [t("alert(1)")]), h("style", [t("p{}")])]));
    expect(serializeRichText(readEditorBlocks(dom))).toBe("kept");
  });

  it("returns nothing for an emptied editor", () => {
    expect(serializeRichText(readEditorBlocks(root(h("p", [h("br")]))))).toBe("");
  });
});
