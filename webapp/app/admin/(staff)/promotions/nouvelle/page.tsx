import { zoneScreen } from "../../../../_zones/zonePage";
import { AdminPromotionEditorScreen } from "../../../../../src/zones/admin";

const page = zoneScreen("/admin/promotions/nouvelle", AdminPromotionEditorScreen);
export const generateMetadata = page.generateMetadata;
export default page.Page;
