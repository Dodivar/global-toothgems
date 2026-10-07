import clsx from "clsx";

/** Languages with a lounge, open or announced. */
export type FlagCode = "en" | "fr" | "de" | "es" | "it" | "pt";

/**
 * Small flags drawn in SVG rather than flag emoji, which Windows does not
 * draw (it shows two letters instead). Decorative: the language's name is
 * always written beside it.
 */
export function LanguageFlag({ code, className }: { code: FlagCode; className?: string }) {
  return (
    <svg viewBox="0 0 30 20" aria-hidden="true" className={clsx("inline-block h-[0.9em] w-[1.35em] flex-none overflow-hidden rounded-[2px] shadow-[0_0_0_1px_rgba(17,17,17,.12)]", className)}>
      {code === "en" && (
        <>
          <rect width="30" height="20" fill="#012169" />
          <path d="M0,0 L30,20 M30,0 L0,20" stroke="#fff" strokeWidth="4" />
          <path d="M0,0 L30,20 M30,0 L0,20" stroke="#C8102E" strokeWidth="1.6" />
          <path d="M15,0 V20 M0,10 H30" stroke="#fff" strokeWidth="6" />
          <path d="M15,0 V20 M0,10 H30" stroke="#C8102E" strokeWidth="3.4" />
        </>
      )}
      {code === "fr" && (
        <>
          <rect width="10" height="20" fill="#0055A4" />
          <rect x="10" width="10" height="20" fill="#fff" />
          <rect x="20" width="10" height="20" fill="#EF4135" />
        </>
      )}
      {code === "de" && (
        <>
          <rect width="30" height="7" fill="#000" />
          <rect y="6.67" width="30" height="6.67" fill="#DD0000" />
          <rect y="13.33" width="30" height="6.67" fill="#FFCE00" />
        </>
      )}
      {code === "es" && (
        <>
          <rect width="30" height="20" fill="#AA151B" />
          <rect y="5" width="30" height="10" fill="#F1BF00" />
        </>
      )}
      {code === "it" && (
        <>
          <rect width="10" height="20" fill="#009246" />
          <rect x="10" width="10" height="20" fill="#fff" />
          <rect x="20" width="10" height="20" fill="#CE2B37" />
        </>
      )}
      {code === "pt" && (
        <>
          <rect width="12" height="20" fill="#006600" />
          <rect x="12" width="18" height="20" fill="#FF0000" />
        </>
      )}
    </svg>
  );
}
