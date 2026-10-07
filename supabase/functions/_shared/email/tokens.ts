/**
 * Design tokens of the e-mail layout: the site's tokens (`webapp/src/index.css`)
 * as literal values, because e-mail clients ignore CSS variables and most of a
 * stylesheet. Change a colour here, never inline in a component.
 *
 * Accent discipline (guidelines/03): emerald is the primary action only,
 * fuchsia is kept for promotional highlights, the pastel blue carries the brand
 * on surfaces. A component never mixes emerald and fuchsia.
 */

export const color = {
  white: "#ffffff",
  page: "#f4f8fc", // --gt-blue-50, the site's page background
  blueWash: "#e7eef7", // --gt-blue-100
  blueBorder: "#d3e0ef", // --gt-blue-200
  blue: "#b9cde5", // --gt-blue-300, the brand pastel blue
  blueInk: "#3f5a75", // --gt-blue-700, text on blue surfaces (7:1 on white)
  ink: "#111111", // --gt-ink-900, headings and buttons
  body: "#2b2b2b", // --gt-ink-700, body copy
  muted: "#5c5c5c", // --gt-ink-500, secondary copy (6.4:1 on the page)
  hairline: "#e4e3df", // --gt-ink-200
  sand: "#f2f1ed", // --gt-sand
  emerald: "#3edba0", // --gt-emerald-400, primary CTA (ink text: 11:1)
  emeraldInk: "#0b7e5b", // --gt-emerald-600
  emeraldWash: "#e4f9f0",
  fuchsiaInk: "#a8115f", // --gt-fuchsia-600, the only fuchsia used for text
  fuchsia: "#e0479b", // --gt-fuchsia-400, decorative accents only
  fuchsiaWash: "#fdeaf3",
  amberInk: "#9a6410",
  amberWash: "#fdf3e3",
  redInk: "#a5162e",
  redWash: "#fdecef",
} as const;

/** Montserrat where the client loads web fonts (Apple Mail, iOS, Outlook.com…), else the site's own fallbacks. */
export const fontStack = "Montserrat,'Helvetica Neue',Helvetica,Arial,sans-serif";

export const size = {
  /** Width of the message column on a desktop client. */
  container: 600,
  /** Horizontal padding inside the card; 20px under 620px (see the layout's media query). */
  gutter: 40,
  radiusCard: 18,
  radiusBlock: 12,
  /** Logo shown at half its pixel size (the PNG is 360×99) to stay sharp on retina screens. */
  logoWidth: 180,
  logoHeight: 50,
} as const;

/** The status colours, each with a glyph so that a state never rests on colour alone. */
export const tone = {
  info: { ink: color.blueInk, wash: color.blueWash, rule: color.blue, glyph: "i" },
  success: { ink: color.emeraldInk, wash: color.emeraldWash, rule: color.emerald, glyph: "✓" },
  warning: { ink: color.amberInk, wash: color.amberWash, rule: "#e8a33d", glyph: "!" },
  important: { ink: color.redInk, wash: color.redWash, rule: "#d6455d", glyph: "!" },
  neutral: { ink: color.body, wash: color.sand, rule: color.hairline, glyph: "•" },
} as const;

export type Tone = keyof typeof tone;
