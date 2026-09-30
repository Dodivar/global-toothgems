import { zoneScreen } from "../../../../_zones/zonePage";
import { AdminPromotionPreviewScreen } from "../../../../../src/zones/admin";

const page = zoneScreen("/admin/promotions/apercu", AdminPromotionPreviewScreen);
export const generateMetadata = page.generateMetadata;
export default page.Page;
