import type { Appearance, CssFontSource, Stripe } from "@stripe/stripe-js";

/**
 * Stripe.js for the payment step. Loaded only once the customer reaches it
 * (never on page load, never in mock mode): `@stripe/stripe-js/pure` does not
 * inject the script on import, so importing this module costs nothing.
 *
 * The card details are typed into Stripe's own fields (iframes served by
 * js.stripe.com): they never reach our page, our functions or our database.
 */

const loaded = new Map<string, Promise<Stripe | null>>();

export function loadStripeFor(publishableKey: string, locale: "fr" | "en"): Promise<Stripe | null> {
  const key = `${publishableKey}:${locale}`;
  let promise = loaded.get(key);
  if (!promise) {
    promise = import("@stripe/stripe-js/pure").then(({ loadStripe }) => loadStripe(publishableKey, { locale }));
    // A failed load (offline, blocked script) can be retried.
    promise.catch(() => loaded.delete(key));
    loaded.set(key, promise);
  }
  return promise;
}

/** The iframes cannot see the page's fonts: Montserrat is loaded into them too. */
export const STRIPE_FONTS: CssFontSource[] = [
  { cssSrc: "https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap" },
];

/** Fallbacks are the values of `src/index.css`, used when a token cannot be read. */
const TOKENS = {
  "--gt-ink-900": "#111111",
  "--gt-ink-700": "#2b2b2b",
  "--gt-ink-500": "#5c5c5c",
  "--gt-ink-400": "#8a8a8a",
  "--gt-ink-300": "#c9c9c7",
  "--gt-ink-100": "#f0efeb",
  "--gt-white": "#ffffff",
  "--gt-blue-50": "#f4f8fc",
  "--gt-blue-600": "#5a7796",
  "--gt-red-500": "#d6455d",
  "--gt-red-600": "#a5162e",
} as const;

type Token = keyof typeof TOKENS;

/**
 * The payment form drawn with the site's own design tokens (Appearance API):
 * pill fields like the storefront's inputs, eyebrow labels, the shipping
 * options' selected style for the payment methods. Read in the browser only.
 */
export function stripeAppearance(): Appearance {
  const style = typeof document === "undefined" ? null : getComputedStyle(document.documentElement);
  const token = (name: Token) => style?.getPropertyValue(name).trim() || TOKENS[name];
  const ink900 = token("--gt-ink-900");
  const ink500 = token("--gt-ink-500");
  const ink300 = token("--gt-ink-300");
  const focus = "0 0 0 3px rgba(185, 205, 229, .9)";
  return {
    theme: "stripe",
    labels: "above",
    variables: {
      fontFamily: '"Montserrat", "Helvetica Neue", Arial, sans-serif',
      fontSizeBase: "15px",
      fontWeightNormal: "400",
      fontWeightMedium: "500",
      fontWeightBold: "600",
      colorPrimary: ink900,
      colorBackground: token("--gt-white"),
      colorText: ink900,
      colorTextSecondary: ink500,
      colorTextPlaceholder: token("--gt-ink-400"),
      colorDanger: token("--gt-red-600"),
      colorIcon: ink500,
      borderRadius: "12px",
      spacingUnit: "4px",
      gridRowSpacing: "16px",
      gridColumnSpacing: "12px",
      focusBoxShadow: focus,
      focusOutline: "none",
    },
    rules: {
      ".Label": {
        fontSize: "11px",
        fontWeight: "600",
        textTransform: "uppercase",
        letterSpacing: ".18em",
        color: ink500,
        marginBottom: "6px",
      },
      ".Input": {
        border: `1px solid ${ink300}`,
        borderRadius: "999px",
        boxShadow: "none",
        padding: "12px 18px",
        fontSize: "15px",
      },
      ".Input:hover": { borderColor: token("--gt-ink-400") },
      ".Input:focus": { borderColor: token("--gt-blue-600"), boxShadow: focus },
      ".Input--invalid": { borderColor: token("--gt-red-500"), boxShadow: "none" },
      ".Error": { fontSize: "13px" },
      ".AccordionItem": {
        border: `1px solid ${ink300}`,
        borderRadius: "12px",
        boxShadow: "none",
        padding: "16px 18px",
      },
      ".AccordionItem--selected": { borderColor: ink900, backgroundColor: token("--gt-white") },
      ".Tab": { border: `1px solid ${ink300}`, boxShadow: "none" },
      ".Tab--selected": { borderColor: ink900, backgroundColor: token("--gt-ink-100"), boxShadow: "none" },
      ".RadioIcon": { width: "18px" },
      ".RadioIconOuter--checked": { stroke: ink900 },
      ".RadioIconInner--checked": { fill: ink900 },
      ".Block": { backgroundColor: token("--gt-blue-50"), boxShadow: "none", border: "none" },
    },
  };
}
