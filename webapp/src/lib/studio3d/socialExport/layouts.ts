import { safeInsets, type FormatSize, type ShareFormat } from "./formats";

/**
 * Where everything sits on a social export: the background, the 3D render,
 * an optional frame, the texts and the corner mark (watermark or logo).
 *
 * "plain" is everyone's layout: the stage, full bleed, the mark in a corner.
 * The others are the Atelier plan's layout templates (decision 101). Each is
 * a pure function of the picture size, versioned so a change of design is a
 * new version, never a silent edit of what members already posted.
 *
 * Pure: no DOM. Colours are the brand tokens of `webapp/src/index.css`.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type ColorStop = [at: number, color: string];

export type Paint =
  /** The Studio stage's own soft blue. */
  | { kind: "stage" }
  | { kind: "solid"; color: string }
  /** Top to bottom. */
  | { kind: "linear"; stops: ColorStop[] }
  /** Centred at (cx, cy) as shares of the picture, radius as a share of its diagonal. */
  | { kind: "radial"; cx: number; cy: number; r: number; stops: ColorStop[] };

export interface TextBlock {
  role: "title" | "handle";
  /** Anchor point: the text's left, centre or right edge (by `align`), its top. */
  x: number;
  y: number;
  maxWidth: number;
  size: number;
  weight: 500 | 600 | 700 | 800;
  color: string;
  align: "left" | "center" | "right";
  uppercase?: boolean;
  /** Extra space between letters, in px. */
  tracking?: number;
}

export interface Layout {
  background: Paint;
  /** Where the 3D render goes. */
  render: Rect;
  renderRadius: number;
  /** True: the render keeps the stage behind the model; false: the model on the layout's background. */
  renderOnStage: boolean;
  frame: { rect: Rect; radius: number; color: string } | null;
  texts: TextBlock[];
  /** The box the corner mark fits in (contained, aligned to `markAlign`). */
  mark: Rect;
  markAlign: "left" | "center" | "right";
  /** Light marks on dark layouts. */
  markTone: "dark" | "light";
}

export interface LayoutText {
  title?: string;
  handle?: string;
}

export type LayoutTemplateId = "plain" | "gallery" | "spotlight" | "band";

export interface LayoutTemplate {
  id: LayoutTemplateId;
  version: number;
  /** Atelier only. */
  premium: boolean;
  compute: (format: ShareFormat, size: FormatSize, text: LayoutText) => Layout;
}

const INK_900 = "#111111";
const INK_100 = "#f0efeb";
const BLUE_50 = "#f4f8fc";
const BLUE_200 = "#d3e0ef";
const BLUE_700 = "#3f5a75";
const FUCHSIA_300 = "#f59cc7";
const WHITE = "#ffffff";

const hasText = (s: string | undefined) => !!s && s.trim().length > 0;

/** The corner mark's box: a share of the width, within the safe margins. */
function cornerMark(format: ShareFormat, size: FormatSize, corner: "bottomRight" | "topRight" = "bottomRight"): Rect {
  const insets = safeInsets(format, size);
  const w = Math.round(size.width * 0.26);
  const h = Math.round(Math.max(48, size.width * 0.09));
  const x = size.width - insets.side - w;
  const y = corner === "bottomRight" ? size.height - insets.bottom - h : insets.top;
  return { x, y, w, h };
}

const plain: LayoutTemplate = {
  id: "plain",
  version: 1,
  premium: false,
  compute: (format, size) => ({
    background: { kind: "stage" },
    render: { x: 0, y: 0, w: size.width, h: size.height },
    renderRadius: 0,
    renderOnStage: true,
    frame: null,
    texts: [],
    mark: cornerMark(format, size),
    markAlign: "right",
    markTone: "dark",
  }),
};

/** Light card: the render framed in white on a cream ground, the title and handle under it. */
const gallery: LayoutTemplate = {
  id: "gallery",
  version: 1,
  premium: true,
  compute: (format, size, text) => {
    const s = size.width / 1080;
    const insets = safeInsets(format, size);
    const titleSize = Math.round(62 * s);
    const handleSize = Math.round(34 * s);
    const border = Math.round(16 * s);
    const markH = Math.round(70 * s);
    const textH = (hasText(text.title) ? titleSize * 1.35 : 0) + (hasText(text.handle) ? handleSize * 1.6 : 0);
    const top = insets.top + border;
    const bottom = size.height - insets.bottom - markH - Math.round(28 * s);
    const renderW = size.width - 2 * insets.side - 2 * border;
    const renderH = Math.max(Math.round(size.height * 0.3), bottom - top - textH - Math.round(56 * s) - 2 * border);
    const render = { x: insets.side + border, y: top, w: renderW, h: renderH };
    const texts: TextBlock[] = [];
    let y = render.y + render.h + border + Math.round(44 * s);
    if (hasText(text.title)) {
      texts.push({ role: "title", x: size.width / 2, y, maxWidth: renderW, size: titleSize, weight: 800, color: INK_900, align: "center" });
      y += Math.round(titleSize * 1.35);
    }
    if (hasText(text.handle)) {
      texts.push({ role: "handle", x: size.width / 2, y, maxWidth: renderW, size: handleSize, weight: 600, color: BLUE_700, align: "center" });
    }
    return {
      background: { kind: "linear", stops: [[0, BLUE_50], [1, INK_100]] },
      render,
      renderRadius: Math.round(28 * s),
      renderOnStage: true,
      frame: { rect: { x: render.x - border, y: render.y - border, w: render.w + 2 * border, h: render.h + 2 * border }, radius: Math.round(40 * s), color: WHITE },
      texts,
      mark: { x: insets.side, y: size.height - insets.bottom - markH, w: size.width - 2 * insets.side, h: markH },
      markAlign: "center",
      markTone: "dark",
    };
  },
};

/** Dark spotlight: the design glowing on ink, the title above, the handle below. */
const spotlight: LayoutTemplate = {
  id: "spotlight",
  version: 1,
  premium: true,
  compute: (format, size, text) => {
    const s = size.width / 1080;
    const insets = safeInsets(format, size);
    const titleSize = Math.round(54 * s);
    const handleSize = Math.round(36 * s);
    const titleH = hasText(text.title) ? Math.round(titleSize * 1.6) : 0;
    const footH = Math.round(Math.max(handleSize * 1.8, 80 * s));
    const top = insets.top + titleH;
    const bottom = size.height - insets.bottom - footH;
    const texts: TextBlock[] = [];
    if (hasText(text.title)) {
      texts.push({
        role: "title",
        x: size.width / 2,
        y: insets.top,
        maxWidth: size.width - 2 * insets.side,
        size: titleSize,
        weight: 700,
        color: WHITE,
        align: "center",
        uppercase: true,
        tracking: Math.round(6 * s),
      });
    }
    if (hasText(text.handle)) {
      texts.push({ role: "handle", x: insets.side, y: bottom + Math.round(footH / 2 - handleSize / 2), maxWidth: size.width * 0.55, size: handleSize, weight: 600, color: FUCHSIA_300, align: "left" });
    }
    return {
      background: { kind: "radial", cx: 0.5, cy: 0.48, r: 0.6, stops: [[0, BLUE_700], [0.55, "#1c2733"], [1, INK_900]] },
      render: { x: 0, y: top, w: size.width, h: Math.max(Math.round(size.height * 0.3), bottom - top) },
      renderRadius: 0,
      renderOnStage: false,
      frame: null,
      texts,
      mark: { x: size.width - insets.side - Math.round(size.width * 0.3), y: bottom + Math.round((footH - 64 * s) / 2), w: Math.round(size.width * 0.3), h: Math.round(64 * s) },
      markAlign: "right",
      markTone: "light",
    };
  },
};

/** Studio card: the stage full bleed above a deep blue band carrying the title, handle and mark. */
const band: LayoutTemplate = {
  id: "band",
  version: 1,
  premium: true,
  compute: (format, size, text) => {
    const s = size.width / 1080;
    const insets = safeInsets(format, size);
    const titleSize = Math.round(56 * s);
    const handleSize = Math.round(32 * s);
    const pad = Math.round(44 * s);
    const content = Math.round(Math.max(titleSize * 1.3 + handleSize * 1.5, 96 * s));
    const bandTop = size.height - insets.bottom - content - 2 * pad + (format === "story" ? 0 : Math.round(insets.bottom * 0.6));
    const texts: TextBlock[] = [];
    const left = insets.side;
    const textW = Math.round(size.width * 0.58);
    let y = bandTop + pad;
    if (hasText(text.title)) {
      texts.push({ role: "title", x: left, y, maxWidth: textW, size: titleSize, weight: 800, color: WHITE, align: "left" });
      y += Math.round(titleSize * 1.3);
    }
    if (hasText(text.handle)) {
      texts.push({ role: "handle", x: left, y, maxWidth: textW, size: handleSize, weight: 600, color: BLUE_200, align: "left" });
    }
    const markW = Math.round(size.width * 0.28);
    return {
      background: { kind: "solid", color: BLUE_700 },
      render: { x: 0, y: 0, w: size.width, h: bandTop },
      renderRadius: 0,
      renderOnStage: true,
      frame: null,
      texts,
      mark: { x: size.width - insets.side - markW, y: bandTop + pad, w: markW, h: content },
      markAlign: "right",
      markTone: "light",
    };
  },
};

export const LAYOUT_TEMPLATES: Record<LayoutTemplateId, LayoutTemplate> = { plain, gallery, spotlight, band };

/** In the order the dialog offers them. */
export const LAYOUT_TEMPLATE_IDS: readonly LayoutTemplateId[] = ["plain", "gallery", "spotlight", "band"];

export function isLayoutTemplateId(value: unknown): value is LayoutTemplateId {
  return typeof value === "string" && (LAYOUT_TEMPLATE_IDS as readonly string[]).includes(value);
}

/** The layout for a template, falling back to "plain" when templates are not allowed. */
export function layoutFor(id: LayoutTemplateId, templatesAllowed: boolean, format: ShareFormat, size: FormatSize, text: LayoutText = {}): Layout {
  const template = LAYOUT_TEMPLATES[templatesAllowed ? id : "plain"] ?? plain;
  return template.compute(format, size, text);
}

/** An image of `imageW` × `imageH` fitted inside `box` (contained), aligned horizontally, centred vertically. */
export function placeMark(box: Rect, imageW: number, imageH: number, align: Layout["markAlign"]): Rect {
  if (imageW <= 0 || imageH <= 0) return { x: box.x, y: box.y, w: 0, h: 0 };
  const scale = Math.min(box.w / imageW, box.h / imageH);
  const w = imageW * scale;
  const h = imageH * scale;
  const x = align === "left" ? box.x : align === "center" ? box.x + (box.w - w) / 2 : box.x + box.w - w;
  return { x, y: box.y + (box.h - h) / 2, w, h };
}

/** Rects fully inside the picture? (layout sanity, used by the tests). */
export function insidePicture(rect: Rect, size: FormatSize): boolean {
  return rect.x >= 0 && rect.y >= 0 && rect.x + rect.w <= size.width + 0.5 && rect.y + rect.h <= size.height + 0.5 && rect.w >= 0 && rect.h >= 0;
}
