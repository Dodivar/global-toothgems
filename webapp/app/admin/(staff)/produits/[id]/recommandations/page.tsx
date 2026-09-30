import { zoneScreen } from "../../../../../_zones/zonePage";
import { AdminProductRecommendationsScreen } from "../../../../../../src/zones/admin";

const page = zoneScreen(({ id }) => `/admin/produits/${id}/recommandations`, AdminProductRecommendationsScreen);
export const generateMetadata = page.generateMetadata;
export default page.Page;
