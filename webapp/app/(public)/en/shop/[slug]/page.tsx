import { ProductPage, productMetadata, type ProductPageProps } from "../../../../_public/productPage";

/** A product page in English: `/en/shop/<English slug>` (see `app/_public/productPage.tsx`). */
export function generateMetadata(props: ProductPageProps) {
  return productMetadata(props, "en");
}

export default function Page(props: ProductPageProps) {
  return <ProductPage props={props} locale="en" />;
}
