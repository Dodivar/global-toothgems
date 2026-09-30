import { zoneScreen } from "../../../../../_zones/zonePage";
import { AdminProductRecommendations } from "../../../../../../src/screens/admin/AdminProductRecommendations";

const page = zoneScreen(({ id }) => `/admin/produits/${id}/recommandations`, <AdminProductRecommendations />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
