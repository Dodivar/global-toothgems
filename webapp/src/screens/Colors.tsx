"use client";

import { useTranslation } from "react-i18next";
import { SelectorPage, SelectorTile } from "../components/shop/SelectorPage";
import { ColorSwatch } from "../components/ui/ColorSwatch";
import { colorsInCatalog } from "../data/products";
import { useCatalog } from "../lib/catalog/CatalogProvider";
import { useLocalized } from "../lib/localized";
import { colorHref } from "../lib/shopUrl";

/** The colour counterpart of {@link Shapes}. */
export function Colors() {
  const { t } = useTranslation();
  const L = useLocalized();
  const { products, colors } = useCatalog();

  return (
    <SelectorPage eyebrow={t("colorsPage.eyebrow")} title={t("colorsPage.title")} body={t("colorsPage.body")}>
      {colorsInCatalog(products, colors).map((group) => (
        <SelectorTile
          key={group.color.slug}
          to={colorHref(group.color.slug)}
          ariaLabel={t("shop.colorTileAria", { color: L(group.color.name), count: group.count })}
          media={<ColorSwatch color={group.color} size={72} />}
          label={L(group.color.name)}
          count={t("home.shapeCount", { count: group.count })}
        />
      ))}
    </SelectorPage>
  );
}
