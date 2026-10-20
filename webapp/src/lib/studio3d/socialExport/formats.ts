/**
 * The picture sizes of a social export, and where each network's own
 * interface covers the picture.
 *
 * Pure: no DOM. Sizes are device pixels; the three formats are the ones
 * Instagram, TikTok and Facebook take without cropping.
 */

export type ShareFormat = "story" | "square" | "portrait";

export interface FormatSize {
  width: number;
  height: number;
}

/** In the order the export dialog offers them. */
export const SHARE_FORMATS: readonly ShareFormat[] = ["story", "square", "portrait"];

export const FORMAT_SIZES: Record<ShareFormat, FormatSize> = {
  /** 9:16 — Stories, Reels, TikTok. */
  story: { width: 1080, height: 1920 },
  /** 1:1 — the classic feed post. */
  square: { width: 1080, height: 1080 },
  /** 4:5 — the tallest feed post. */
  portrait: { width: 1080, height: 1350 },
};

/** The ratio a format is known by ("9:16"). */
export const FORMAT_RATIOS: Record<ShareFormat, string> = { story: "9:16", square: "1:1", portrait: "4:5" };

export function isShareFormat(value: unknown): value is ShareFormat {
  return typeof value === "string" && (SHARE_FORMATS as readonly string[]).includes(value);
}

/**
 * The format at `width` device pixels wide, same ratio, both sides even
 * (video encoders refuse odd sizes). Never larger than the format itself.
 */
export function scaledSize(format: ShareFormat, width: number): FormatSize {
  const full = FORMAT_SIZES[format];
  const w = Math.min(full.width, Math.max(2, Math.round(width / 2) * 2));
  const h = Math.max(2, Math.round((full.height * w) / full.width / 2) * 2);
  return { width: w, height: h };
}

export interface Insets {
  top: number;
  bottom: number;
  side: number;
}

/**
 * Margins kept clear of text and logos. A Story is covered by the profile
 * line at the top (about 250 px of 1920) and the reply bar at the bottom
 * (about 340 px); feed posts only need a comfortable margin.
 */
export function safeInsets(format: ShareFormat, size: FormatSize): Insets {
  const side = Math.round(size.width * 0.06);
  if (format === "story") {
    return { top: Math.round((size.height * 250) / 1920), bottom: Math.round((size.height * 340) / 1920), side };
  }
  const m = Math.round(Math.min(size.width, size.height) * 0.06);
  return { top: m, bottom: m, side };
}
