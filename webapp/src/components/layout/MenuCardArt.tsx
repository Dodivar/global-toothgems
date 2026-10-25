import clsx from "clsx";
import monogramBlue from "../../assets/monogram-blue.png";
import monogramWhite from "../../assets/monogram-white.png";

/**
 * Menu thumbnails of the two cards the shop offers, drawn like the real ones:
 * the gift card in the store's default design (`.gt-giftcard`, as on
 * /carte-cadeau) and the Loyalty Club card in the site blue with its stamp
 * slots. Decorative: the entry's own text names the link.
 */

const STAMPS = 5;
const INKED = 3;

export function MenuCardArt({ kind, compact }: { kind: "giftCard" | "loyalty"; compact: boolean }) {
  const size = compact ? "h-14" : "h-[52px]";
  if (kind === "giftCard") {
    return (
      <span
        aria-hidden="true"
        data-design="sparkle"
        className={clsx("gt-giftcard relative flex aspect-[1.586/1] flex-none flex-col justify-between overflow-hidden rounded-[10px] p-1.5", size)}
      >
        <img src={monogramBlue.src} alt="" className="h-3 w-auto self-start" />
        <span className="flex items-end justify-between">
          <span className="h-1 w-6 rounded-full bg-[var(--gt-blue-700)]/40" />
          <span className="h-3 w-3 rounded-full bg-white/70 ring-1 ring-white" />
        </span>
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className={clsx(
        "relative flex aspect-[1.586/1] flex-none flex-col justify-between overflow-hidden rounded-[10px] p-1.5 shadow-[0_6px_14px_-8px_rgba(35,52,71,.6)]",
        "bg-[radial-gradient(120%_90%_at_100%_0%,rgba(255,255,255,.28),transparent_55%),linear-gradient(135deg,var(--gt-blue-500),var(--gt-blue-700))]",
        size,
      )}
    >
      <img src={monogramWhite.src} alt="" className="h-3 w-auto self-start" />
      <span className="flex items-center justify-between gap-[3px]">
        {Array.from({ length: STAMPS }, (_, i) => (
          <span
            key={i}
            className={clsx(
              "h-2.5 w-2.5 rounded-full",
              i < INKED ? "bg-white" : "border border-dashed border-white/60",
            )}
          />
        ))}
      </span>
    </span>
  );
}
