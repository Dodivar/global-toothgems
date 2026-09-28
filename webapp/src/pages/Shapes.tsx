import { useTranslation } from "react-i18next";
import { SelectorPage, SelectorTile } from "../components/shop/SelectorPage";
import { ShapeGlyph } from "../components/ui/ShapeGlyph";
import { useCatalog } from "../lib/catalog/CatalogProvider";
import { useShapesInCatalog } from "../lib/catalog/useShapesInCatalog";
import { shapeHref } from "../lib/shopUrl";

/** Every cut on one page — the carousel's overflow, for people who want to see
 *  the whole range at once before narrowing the collection. */
export function Shapes() {
  const { t } = useTranslation();
  const { products } = useCatalog();
  const shapes = useShapesInCatalog(products);

  return (
    <SelectorPage eyebrow={t("shapesPage.eyebrow")} title={t("shapesPage.title")} body={t("shapesPage.body")}>
      {shapes.map((group) => (
        <SelectorTile
          key={group.shape}
          to={shapeHref(group.shape)}
          ariaLabel={t("home.shapeTileAria", { shape: t(`shop.shapes.${group.shape}`), count: group.count })}
          media={<ShapeGlyph shape={group.shape} size={58} />}
          label={t(`shop.shapes.${group.shape}`)}
          count={t("home.shapeCount", { count: group.count })}
        />
      ))}
    </SelectorPage>
  );
}
