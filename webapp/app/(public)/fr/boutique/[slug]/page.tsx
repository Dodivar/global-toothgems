import { ProductPage, productMetadata, type ProductPageProps } from "../../../../_public/productPage";

/** A product page in French: `/fr/boutique/<French slug>` (see `app/_public/productPage.tsx`). */
export function generateMetadata(props: ProductPageProps) {
  return productMetadata(props, "fr");
}

export default function Page(props: ProductPageProps) {
  return <ProductPage props={props} locale="fr" />;
}
