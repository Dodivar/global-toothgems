import { zoneScreen } from "../../../_zones/zonePage";
import { AdminPromotionsScreen } from "../../../../src/zones/admin";

const page = zoneScreen("/admin/promotions", AdminPromotionsScreen);
export const generateMetadata = page.generateMetadata;
export default page.Page;
