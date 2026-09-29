import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import clsx from "clsx";
import { Button } from "../ui/Button";
import type { ShopCategory } from "../../data/products";
import { photo } from "../../lib/images";
import { useReveal } from "../../lib/useReveal";

/**
 * A category tile is either a photograph (the high-resolution mouth shots)
 * or product shots on a brand tint. The product shots are 299 px masters,
 * shown near their native size and never stretched to fill a tile. Gems are
 * on pure white and are multiplied into the tint as loose stones; packshots
 * on a grey studio backdrop (`print`) are mounted as small white prints
 * instead, so their square reads as intended.
 */
type TileArt =
  | { kind: "photo"; src: string; position?: string }
  | { kind: "cutouts"; tone: "blue" | "brand" | "sand"; items: { src: string; className: string; print?: boolean }[] };

interface Tile {
  cat: ShopCategory;
  copyKey: "gems" | "tools" | "kits" | "aftercare" | "accessories";
  art: TileArt;
  /** Placement in the 12-column desktop mosaic and the 2-column tablet grid. */
  area: string;
  /** The large tile gets the large type. */
  hero?: boolean;
}

const TILES: Tile[] = [
  {
    cat: "Gems",
    copyKey: "gems",
    hero: true,
    art: { kind: "photo", src: photo("mouth-02.jpg"), position: "50% 42%" },
    area: "md:col-span-2 lg:col-span-6 lg:row-span-2",
  },
  {
    cat: "Outils",
    copyKey: "tools",
    art: {
      kind: "cutouts",
      tone: "blue",
      items: [{ src: photo("img-01.jpg"), print: true, className: "right-[7%] top-1/2 w-[40%] max-w-[190px] -translate-y-1/2 rotate-[-6deg]" }],
    },
    area: "lg:col-span-4 lg:col-start-7",
  },
  {
    cat: "Kits",
    copyKey: "kits",
    art: {
      kind: "cutouts",
      tone: "brand",
      items: [
        { src: photo("img-11.jpg"), className: "left-1/2 top-[10%] w-[62%] max-w-[170px] -translate-x-1/2" },
        { src: photo("img-13.jpg"), className: "left-[6%] top-[38%] w-[38%] max-w-[104px]" },
        { src: photo("img-05.jpg"), className: "right-[8%] top-[34%] w-[34%] max-w-[92px]" },
      ],
    },
    area: "lg:col-span-2 lg:col-start-11 lg:row-span-2",
  },
  {
    cat: "Suivi",
    copyKey: "aftercare",
    art: {
      kind: "cutouts",
      tone: "sand",
      items: [{ src: photo("img-08.jpg"), print: true, className: "right-[8%] top-[8%] w-[50%] max-w-[150px] rotate-[5deg]" }],
    },
    area: "lg:col-span-2 lg:col-start-7 lg:row-start-2",
  },
  {
    cat: "Accessoires",
    copyKey: "accessories",
    art: { kind: "photo", src: photo("mouth-05.jpg"), position: "50% 50%" },
    area: "lg:col-span-2 lg:col-start-9 lg:row-start-2",
  },
];

const TONE_BG: Record<"blue" | "brand" | "sand", string> = {
  blue: "bg-[var(--gt-blue-100)]",
  brand: "bg-[var(--gt-blue-300)]",
  sand: "bg-[var(--gt-sand)]",
};

/**
 * The five shop categories as an asymmetric mosaic: one large photographic
 * tile for the gems, then tools, kits, aftercare and accessories in varied
 * sizes. Each tile opens the shop filtered on that category, through the same
 * `categorie` parameter the shop's own filter bar writes. On a phone the
 * mosaic becomes a swiped row of tall cards.
 */
export function CategoryMosaic() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const ref = useReveal<HTMLElement>();

  return (
    <section ref={ref} aria-labelledby="gt-alt-categories-title" className="gt-reveal gt-alt-section w-full">
      <div className="gt-alt-wide px-[var(--gt-alt-gutter)]">
        <div className="mb-10 grid grid-cols-[minmax(0,1fr)] gap-6 lg:mb-14 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-end">
          <div className="grid gap-4">
            <span className="gt-eyebrow">{t("homeAlt.categories.eyebrow")}</span>
            <h2 id="gt-alt-categories-title" className="gt-alt-h2 max-w-[16ch]">{t("homeAlt.categories.title")}</h2>
          </div>
          <div className="grid justify-items-start gap-4 lg:justify-self-end">
            <p className="m-0 max-w-[40ch] text-[length:var(--text-body-md)] text-[var(--text-body)]">{t("homeAlt.categories.body")}</p>
            <Button variant="ghost" iconRight={ArrowRight} className="-ml-[22px]" onClick={() => navigate("/boutique")}>
              {t("homeAlt.categories.shopAll")}
            </Button>
          </div>
        </div>
      </div>

      {/* Phone: a swiped row that runs to the screen edge. Tablet: two
          columns. Desktop: the 12-column mosaic. */}
      <ul className="gt-scroller gt-alt-snap-pad m-0 flex list-none gap-3 p-0 pb-2 pl-[var(--gt-alt-gutter)] pr-[var(--gt-alt-gutter)] md:grid md:grid-cols-2 md:gap-4 md:overflow-visible lg:mx-auto lg:max-w-[var(--gt-alt-max)] lg:grid-cols-12 lg:grid-rows-[repeat(2,clamp(240px,19vw,340px))] lg:gap-5">
        {TILES.map((tile, i) => (
          <li key={tile.cat} className={clsx("w-[78%] max-w-[340px] flex-none snap-start md:w-auto md:max-w-none", tile.area)}>
            <CategoryTile tile={tile} index={i} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function CategoryTile({ tile, index }: { tile: Tile; index: number }) {
  const { t } = useTranslation();
  const photoTile = tile.art.kind === "photo";

  return (
    <Link
      to={`/boutique?categorie=${tile.cat}`}
      className={clsx(
        "gt-alt-tile group relative flex h-full min-h-[340px] flex-col justify-end overflow-hidden rounded-[var(--radius-xl)] shadow-[var(--shadow-card)] md:min-h-[260px]",
        tile.hero && "md:min-h-[380px]",
        tile.art.kind === "cutouts" && TONE_BG[tile.art.tone],
      )}
    >
      {tile.art.kind === "photo" ? (
        <>
          <img
            src={tile.art.src}
            alt=""
            loading="lazy"
            decoding="async"
            className="gt-alt-tile-art absolute inset-0 h-full w-full object-cover"
            style={{ objectPosition: tile.art.position }}
          />
          <span aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(180deg,rgba(17,17,17,0)_35%,rgba(17,17,17,.72)_100%)]" />
        </>
      ) : (
        <span aria-hidden="true" className="gt-alt-tile-art absolute inset-0">
          {tile.art.items.map((item) =>
            item.print ? (
              <span key={item.src} className={clsx("gt-alt-print absolute block rounded-[var(--radius-md)] bg-white p-1.5 shadow-[var(--shadow-card)]", item.className)}>
                <img src={item.src} alt="" loading="lazy" decoding="async" className="block aspect-square w-full rounded-[var(--radius-sm)] object-cover" />
              </span>
            ) : (
              <img key={item.src} src={item.src} alt="" loading="lazy" decoding="async" className={clsx("gt-alt-cutout absolute", item.className)} />
            ),
          )}
        </span>
      )}

      <span className={clsx("relative grid gap-1.5 p-[clamp(18px,2vw,28px)]", photoTile ? "text-[var(--gt-off-white)]" : "text-[var(--gt-ink-900)]")}>
        <span aria-hidden="true" className={clsx("text-[11px] font-semibold tabular-nums tracking-[var(--tracking-eyebrow)]", photoTile ? "text-[var(--gt-blue-200)]" : "text-[var(--gt-blue-700)]")}>
          {String(index + 1).padStart(2, "0")}
        </span>
        <h3
          className={clsx(
            "font-[var(--weight-black)] leading-[1.05] tracking-[var(--tracking-display)]",
            tile.hero ? "text-[clamp(32px,3.6vw,56px)]" : "text-[clamp(22px,1.7vw,28px)]",
            photoTile ? "text-[var(--gt-off-white)]" : "text-[var(--gt-ink-900)]",
          )}
        >
          {t(`shop.categories.${tile.cat}`)}
        </h3>
        <span className={clsx("max-w-[30ch] font-medium leading-snug", tile.hero ? "text-[length:var(--text-body-lg)]" : "text-[13px]", photoTile ? "text-white/85" : "text-[var(--gt-ink-700)]")}>
          {t(`homeAlt.categories.${tile.copyKey}`)}
        </span>
        <span
          aria-hidden="true"
          className={clsx(
            "mt-2 inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[var(--tracking-wide)]",
            photoTile ? "text-[var(--gt-off-white)]" : "text-[var(--gt-ink-900)]",
          )}
        >
          {t("homeAlt.categories.explore")}
          <ArrowUpRight size={15} className="gt-alt-tile-arrow" />
        </span>
      </span>
    </Link>
  );
}
