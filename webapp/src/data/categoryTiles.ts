import { photo } from "../lib/images";

export interface CategoryTile {
  key: string;
  image: string;
  label: string;
  sub?: string;
  to: string;
}

/**
 * The gem families advertised on the home page.
 *
 * `to` carries the shop filter each tile stands for. These used to navigate to a
 * bare /boutique, so picking a category did nothing.
 *
 * Shared rather than declared per page: the two home-page directions at `/` and
 * `/accueil-b` are meant to be compared, which only holds if they offer exactly
 * the same categories behind exactly the same filters.
 */
export const CATEGORY_TILES: CategoryTile[] = [
  { key: "swarovski", image: photo("img-02.jpg"), label: "Swarovski®", to: "/boutique?categorie=Gems&matiere=Swarovski" },
  { key: "preciosa", image: photo("img-05.jpg"), label: "Preciosa®", to: "/boutique?categorie=Gems&matiere=Cristal" },
  { key: "sparklets", image: photo("img-08.jpg"), label: "Sparklets™", sub: "SS0 SS1", to: "/boutique?categorie=Gems" },
  { key: "or", image: photo("img-11.jpg"), label: "Or 14k et 18k", to: "/boutique?categorie=Gems&matiere=Or+18k" },
  { key: "opale", image: photo("img-14.jpg"), label: "Pièces en opale", to: "/boutique?categorie=Gems&matiere=Opale+de+labo" },
  { key: "zircone", image: photo("img-17.jpg"), label: "Zircone", sub: "minis", to: "/boutique?categorie=Gems&prix=under30" },
  { key: "resine", image: photo("img-19.jpg"), label: "Résine acrylique", sub: "minis", to: "/boutique?categorie=Gems&prix=under30" },
  { key: "fairy", image: photo("img-20.jpg"), label: "Fairy dust", sub: "Swarovski®", to: "/boutique?categorie=Gems&matiere=Swarovski" },
];
