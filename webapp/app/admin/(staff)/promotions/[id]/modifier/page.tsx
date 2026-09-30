import { zoneScreen } from "../../../../../_zones/zonePage";
import { AdminPromotionEditorScreen } from "../../../../../../src/zones/admin";

const page = zoneScreen(({ id }) => `/admin/promotions/${id}/modifier`, AdminPromotionEditorScreen);
export const generateMetadata = page.generateMetadata;
export default page.Page;
