import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "../../lib/navigation";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import clsx from "clsx";
import { Button } from "../ui/Button";
import { familyEntryHref } from "../../lib/shopUrl";
import { FALLBACK_TAXONOMY, findCategory, shopHref, type ShopFamilyDef } from "../../data/taxonomy";
import { pick } from "../../data/types";
import { photo } from "../../lib/images";
import { useCatalog } from "../../lib/catalog/CatalogProvider";
import { useTaxonomy } from "../../lib/catalog/useTaxonomy";
import { useReveal } from "../../lib/useReveal";
import { pickBurstImages, pickFeaturedProduct } from "../../lib/homeCategoryArt";
import type { Product } from "../../data/products";

/**
 * A category tile's art. `photo`: one of the high-resolution mouth shots.
 * `feature`: a product picture from the catalogue, framed close up on white
 * (the kits), or shown whole (`whole`: the lip gloss bottle), with a
 * photograph to show until the catalogue holds it. `burst`: loose stones thrown apart like a bouquet going off, the
 * same visual as the hero's shop slide on a phone: gem pictures cut out of
 * their white background (`gem-*.webp`, transparent, so the stones keep their
 * own colours on the tint). `productBurst`: the same
 * explosion with the category's own product pictures from the catalogue,
 * mounted as small white prints since their backgrounds vary. On hover the
 * pieces of a burst fly a little further apart.
 */
type TileArt =
  | { kind: "photo"; src: string; position?: string }
  | { kind: "feature"; family?: string; slugs: string[]; fallback?: string; whole?: boolean }
  | { kind: "burst"; tone: Tone; pieces: string[] }
  | { kind: "productBurst"; tone: Tone };

type Tone = "blue" | "brand" | "sand";

interface Tile {
  /** Category slug (`categories.slug`). */
  cat: string;
  copyKey: "gems" | "materiel" | "kits" | "lipGloss";
  art: TileArt;
  /** Placement in the 12-column desktop mosaic and the 2-column tablet grid. */
  area: string;
  /** The large tile gets the large type. */
  hero?: boolean;
}

/**
 * A piece of a burst: its centre (`x`, `y`, % of the tile), its width (% of
 * the tile's width, capped at `max` px) and its tilt. Fixed, never random at
 * render time, which would break hydration. The pieces keep to the upper part
 * of the tile, above the copy.
 */
interface Slot {
  x: number;
  y: number;
  w: number;
  max: number;
  rot: number;
}

const GEM_SLOTS: Slot[] = [
  { x: 50, y: 30, w: 16, max: 100, rot: -12 },
  { x: 30, y: 24, w: 12, max: 80, rot: 20 },
  { x: 70, y: 22, w: 13, max: 84, rot: -25 },
  { x: 12, y: 36, w: 10, max: 66, rot: 40 },
  { x: 88, y: 38, w: 10, max: 66, rot: 10 },
  { x: 40, y: 43, w: 8, max: 54, rot: -30 },
  { x: 62, y: 43, w: 9, max: 58, rot: 15 },
  { x: 93, y: 18, w: 7, max: 46, rot: -10 },
  { x: 7, y: 18, w: 8, max: 50, rot: 25 },
  { x: 20, y: 14, w: 6, max: 38, rot: 60 },
  { x: 82, y: 14, w: 7, max: 42, rot: -40 },
  { x: 50, y: 14, w: 7, max: 42, rot: 30 },
];

const PRINT_SLOTS: Slot[] = [
  { x: 50, y: 22, w: 28, max: 108, rot: -5 },
  { x: 20, y: 17, w: 22, max: 86, rot: 9 },
  { x: 80, y: 18, w: 22, max: 86, rot: -11 },
  { x: 32, y: 31, w: 16, max: 62, rot: -14 },
  { x: 69, y: 32, w: 16, max: 62, rot: 12 },
];

/** The kit the home page puts forward: the professional kit, close up. */
const FEATURED_KIT_SLUGS = ["global-pro-studio-kit"];

const TILES: Tile[] = [
  {
    cat: "kits",
    copyKey: "kits",
    hero: true,
    art: { kind: "feature", family: "kit-professionnel", slugs: FEATURED_KIT_SLUGS },
    area: "md:col-span-2 lg:col-span-6 lg:row-span-2",
  },
  {
    cat: "gems",
    copyKey: "gems",
    art: {
      kind: "burst",
      tone: "blue",
      pieces: [
        "gem-img-04.webp",
        "gem-img-07.webp",
        "gem-img-13.webp",
        "gem-img-09.webp",
        "gem-img-05.webp",
        "gem-img-14.webp",
        "gem-img-18.webp",
        "gem-img-02.webp",
        "gem-img-19.webp",
        "gem-img-06.webp",
        "gem-img-15.webp",
        "gem-img-20.webp",
      ],
    },
    area: "md:col-span-2 lg:col-span-6 lg:col-start-7",
  },
  {
    cat: "materiel",
    copyKey: "materiel",
    art: { kind: "productBurst", tone: "sand" },
    area: "lg:col-span-3 lg:col-start-7 lg:row-start-2",
  },
  {
    cat: "lip-gloss",
    copyKey: "lipGloss",
    art: { kind: "feature", slugs: ["global-lipgloss-bad-habit"], fallback: photo("mouth-05.jpg"), whole: true },
    area: "lg:col-span-3 lg:col-start-10 lg:row-start-2",
  },
];

const TONE_BG: Record<Tone, string> = {
  blue: "bg-[var(--gt-blue-100)]",
  brand: "bg-[var(--gt-blue-300)]",
  sand: "bg-[var(--gt-sand)]",
};

/**
 * The four shop categories as an asymmetric mosaic: one large tile for the
 * kits, the professional kit close up, then the toothgems and the equipment
 * as exploded arrangements, and lip gloss. Each tile opens
 * the shop filtered on that category, through the same `categorie` parameter
 * the shop's filter writes, and lists the category's families as links of
 * their own (`famille`). On a phone the mosaic becomes a swiped row of tall
 * cards.
 *
 * A category the back office has hidden loses its tile.
 */
export function CategoryMosaic() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const ref = useReveal<HTMLElement>();
  const { taxonomy } = useCatalog();
  // Until the taxonomy arrives, the prototype's copy keeps the mosaic in place.
  const source = taxonomy.length > 0 ? taxonomy : FALLBACK_TAXONOMY;
  const tiles = TILES.filter((tile) => findCategory(source, tile.cat));

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
            <Button variant="ghost" iconRight={ArrowRight} className="-ml-[18px] sm:-ml-[22px]" onClick={() => navigate("/boutique")}>
              {t("homeAlt.categories.shopAll")}
            </Button>
          </div>
        </div>
      </div>

      {/* Phone: a swiped row that runs to the screen edge. Tablet: two
          columns. Desktop: the 12-column mosaic. */}
      <ul className="gt-scroller gt-alt-snap-pad m-0 flex list-none gap-3 p-0 pb-2 pl-[var(--gt-alt-gutter)] pr-[var(--gt-alt-gutter)] md:grid md:grid-cols-2 md:gap-4 md:overflow-visible lg:mx-auto lg:max-w-[var(--gt-alt-max)] lg:grid-cols-12 lg:grid-rows-[clamp(290px,23vw,400px)_clamp(260px,20vw,360px)] lg:gap-5">
        {tiles.map((tile, i) => (
          <li key={tile.cat} className={clsx("w-[78%] max-w-[340px] flex-none snap-start md:w-auto md:max-w-none", tile.area)}>
            <CategoryTile tile={tile} index={i} families={findCategory(source, tile.cat)?.families ?? []} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function CategoryTile({ tile, index, families }: { tile: Tile; index: number; families: ShopFamilyDef[] }) {
  const { t, i18n } = useTranslation();
  const { categoryName } = useTaxonomy();
  const { products } = useCatalog();
  // White type on a dark scrim over photographs and the featured product.
  const photoTile = tile.art.kind === "photo" || tile.art.kind === "feature";
  const name = categoryName(tile.cat);

  return (
    <div
      className={clsx(
        "gt-alt-tile group relative isolate flex h-full min-h-[340px] flex-col justify-end overflow-hidden rounded-[var(--radius-xl)] shadow-[var(--shadow-card)] md:min-h-[340px] lg:min-h-0",
        tile.hero && "min-h-[440px] md:min-h-[520px] lg:min-h-0",
        tile.art.kind === "feature" && "bg-white",
      )}
    >
      {/* The art sits behind the copy, so the title's stretched link (laid
          over the whole tile) catches a click anywhere on the card. */}
      <span className="absolute inset-0 -z-10">
        {tile.art.kind === "photo" && (
          <>
            <img
              src={tile.art.src}
              alt=""
              loading="lazy"
              decoding="async"
              className="gt-alt-tile-art absolute inset-0 h-full w-full object-cover"
              style={{ objectPosition: tile.art.position }}
            />
            <Scrim />
          </>
        )}
        {tile.art.kind === "feature" && <FeatureArt products={products} cat={tile.cat} art={tile.art} />}
        {tile.art.kind === "burst" && (
          <span aria-hidden="true" className={clsx("gt-alt-tile-art absolute inset-0", TONE_BG[tile.art.tone])}>
            {tile.art.pieces.slice(0, GEM_SLOTS.length).map((name, i) => (
              <BurstPiece key={name} slot={GEM_SLOTS[i]} index={i}>
                {(piece) => <img src={photo(name)} alt="" loading="lazy" decoding="async" className={clsx("gt-alt-gem", piece.className)} style={piece.style} />}
              </BurstPiece>
            ))}
          </span>
        )}
        {tile.art.kind === "productBurst" && (
          <span aria-hidden="true" className={clsx("gt-alt-tile-art absolute inset-0", TONE_BG[tile.art.tone])}>
            {pickBurstImages(products, tile.cat, PRINT_SLOTS.length).map((item, i) => (
              <BurstPiece key={item.key} slot={PRINT_SLOTS[i]} index={i}>
                {(piece) => (
                  <span className={clsx("rounded-[var(--radius-md)] bg-white p-1.5 shadow-[var(--shadow-card)]", piece.className)} style={piece.style}>
                    <img src={item.src} alt="" loading="lazy" decoding="async" className="block aspect-square w-full rounded-[var(--radius-sm)] object-contain" />
                  </span>
                )}
              </BurstPiece>
            ))}
          </span>
        )}
      </span>

      <span className={clsx("grid gap-1.5 p-[clamp(18px,2vw,28px)]", photoTile ? "text-[var(--gt-off-white)]" : "text-[var(--gt-ink-900)]")}>
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
          {/* Stretched link: its ::after covers the whole tile (the art lies
              behind the copy); the family links below sit above it. */}
          <Link to={shopHref(tile.cat)} className="gt-alt-tile-link text-[inherit] after:absolute after:inset-0 after:content-['']">
            {name}
          </Link>
        </h3>
        <span className={clsx("max-w-[30ch] font-medium leading-snug", tile.hero ? "text-[length:var(--text-body-lg)]" : "text-[13px]", photoTile ? "text-white/85" : "text-[var(--gt-ink-700)]")}>
          {t(`homeAlt.categories.${tile.copyKey}`)}
        </span>
        {families.length > 0 && (
          <ul aria-label={t("homeAlt.categories.families", { name })} className="pointer-events-none relative z-[1] m-0 mt-1 flex list-none flex-wrap gap-1.5 p-0">
            {families.map((family) => (
              <li key={family.slug}>
                <Link
                  to={familyEntryHref(tile.cat, family.slug)}
                  className={clsx(
                    // The row lets clicks between the pills through to the tile's link.
                    "pointer-events-auto inline-flex h-7 items-center rounded-[var(--radius-pill)] border px-3 text-[11.5px] font-semibold transition-colors duration-[var(--duration-fast)]",
                    photoTile
                      ? "border-white/40 bg-white/10 text-[var(--gt-off-white)] backdrop-blur-sm hover:bg-white/25"
                      : "border-[var(--gt-ink-900)]/20 bg-white/55 text-[var(--gt-ink-900)] hover:bg-white/90",
                  )}
                >
                  {pick(family.name, i18n.language)}
                </Link>
              </li>
            ))}
          </ul>
        )}
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
    </div>
  );
}

function Scrim() {
  return <span aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(180deg,rgba(17,17,17,0)_35%,rgba(17,17,17,.72)_100%)]" />;
}

/**
 * The featured product filling the tile on white, zoomed in unless shown whole. Until the
 * catalogue holds it the tile shows its fallback photograph, else its tint.
 */
function FeatureArt({ products, cat, art }: { products: Product[]; cat: string; art: Extract<TileArt, { kind: "feature" }> }) {
  const product = pickFeaturedProduct(products, { cat, family: art.family, slugs: art.slugs });
  if (!product && !art.fallback) return <span aria-hidden="true" className={clsx("absolute inset-0", TONE_BG.brand)} />;
  return (
    <>
      <span aria-hidden="true" className="gt-alt-tile-art absolute inset-0 overflow-hidden">
        <img
          src={product?.image ?? art.fallback}
          alt=""
          loading="lazy"
          decoding="async"
          className={clsx("h-full w-full", product && art.whole ? "object-contain" : "object-cover", product && !art.whole && "scale-[1.18]")}
          style={{ objectPosition: "50% 40%" }}
        />
      </span>
      <Scrim />
    </>
  );
}

/**
 * One piece of a burst, placed on its slot. The piece itself tilts, floats
 * and, on hover, flies outwards from the centre.
 */
function BurstPiece({ slot, index, children }: { slot: Slot; index: number; children: (piece: { className: string; style: CSSProperties }) => ReactNode }) {
  const width = `min(${slot.w}%, ${slot.max}px)`;
  // Percentage margins resolve against the tile's width, like the width: the
  // pieces are square, so both centre the piece on its slot.
  const box: CSSProperties = { left: `${slot.x}%`, top: `${slot.y}%`, width, marginLeft: `calc(${width} / -2)`, marginTop: `calc(${width} / -2)` };
  const style = {
    rotate: `${slot.rot}deg`,
    "--gt-burst-x": `${Math.round((slot.x - 50) * 0.5)}px`,
    "--gt-burst-y": `${Math.round((slot.y - 30) * 0.6)}px`,
  } as CSSProperties;
  return (
    <span className="absolute block" style={box}>
      {children({ className: clsx("gt-alt-burst-piece gt-alt-float block w-full", index % 2 === 1 && "gt-alt-float--late"), style })}
    </span>
  );
}
