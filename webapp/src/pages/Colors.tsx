import { useTranslation } from "react-i18next";
import { SelectorPage, SelectorTile } from "../components/shop/SelectorPage";
import { ColorSwatch } from "../components/ui/ColorSwatch";
import { colorsInCatalog } from "../data/products";
import { useCatalog } from "../lib/catalog/CatalogProvider";
import { colorHref } from "../lib/shopUrl";

/** The colour counterpart of {@link Shapes}. */
export function Colors() {
  const { t } = useTranslation();
  const { products } = useCatalog();

  return (
    <SelectorPage eyebrow={t("colorsPage.eyebrow")} title={t("colorsPage.title")} body={t("colorsPage.body")}>
      {colorsInCatalog(products).map((group) => (
        <SelectorTile
          key={group.color}
          to={colorHref(group.color)}
          ariaLabel={t("shop.colorTileAria", { color: t(`shop.colors.${group.color}`), count: group.count })}
          media={<ColorSwatch color={group.color} size={72} />}
          label={t(`shop.colors.${group.color}`)}
          count={t("home.shapeCount", { count: group.count })}
        />
      ))}
    </SelectorPage>
  );
}
