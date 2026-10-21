"use client";

import { useTranslation } from "react-i18next";
import { SelectorPage, SelectorTile } from "../components/shop/SelectorPage";
import { ShapeGlyph } from "../components/ui/ShapeGlyph";
import { GEMS_CATEGORY, shopHref } from "../data/taxonomy";
import { useCatalog } from "../lib/catalog/CatalogProvider";
import { useShapesInCatalog } from "../lib/catalog/useShapesInCatalog";
import { useTaxonomy } from "../lib/catalog/useTaxonomy";
import { useSearchParams } from "../lib/navigation";
import { isShapeFirstFamily, shapeHref } from "../lib/shopUrl";

/** Every cut on one page — the carousel's overflow, for people who want to see
 *  the whole range at once before narrowing the collection. With `?famille=`
 *  (Swarovski) it is the step before that family's products: only its cuts,
 *  each leading to the shop already filtered on family and cut. */
export function Shapes() {
  const { t } = useTranslation();
  const { products } = useCatalog();
  const { familyName } = useTaxonomy();
  const [params] = useSearchParams();
  const requested = params.get("famille");
  const family = isShapeFirstFamily(GEMS_CATEGORY, requested) ? requested : null;
  const scoped = family ? products.filter((p) => p.cat === GEMS_CATEGORY && p.family === family) : products;
  const shapes = useShapesInCatalog(scoped);

  return (
    <SelectorPage
      eyebrow={family ? familyName(family) : t("shapesPage.eyebrow")}
      title={family ? t("shapesPage.familyTitle", { family: familyName(family) }) : t("shapesPage.title")}
      body={family ? t("shapesPage.familyBody", { family: familyName(family) }) : t("shapesPage.body")}
    >
      {shapes.map((group) => (
        <SelectorTile
          key={group.shape}
          to={shapeHref(group.shape, family ?? undefined)}
          ariaLabel={t("home.shapeTileAria", { shape: t(`shop.shapes.${group.shape}`), count: group.count })}
          media={<ShapeGlyph shape={group.shape} size={58} />}
          label={t(`shop.shapes.${group.shape}`)}
          count={t("home.shapeCount", { count: group.count })}
        />
      ))}
      {family && (
        <SelectorTile
          to={shopHref(GEMS_CATEGORY, family)}
          ariaLabel={t("shapesPage.allAria", { family: familyName(family) })}
          media={<span className="text-3xl" aria-hidden="true">∞</span>}
          label={t("shapesPage.all")}
          count={t("home.shapeCount", { count: scoped.length })}
        />
      )}
    </SelectorPage>
  );
}
