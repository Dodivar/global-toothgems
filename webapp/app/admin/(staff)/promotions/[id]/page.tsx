import { zoneScreen } from "../../../../_zones/zonePage";
import { AdminPromotionDetailScreen } from "../../../../../src/zones/admin";

const page = zoneScreen(({ id }) => `/admin/promotions/${id}`, AdminPromotionDetailScreen);
export const generateMetadata = page.generateMetadata;
export default page.Page;
