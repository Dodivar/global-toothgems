import { zoneScreen } from "../../../_zones/zonePage";
import { Promotions as AdminPromotions } from "../../../../src/screens/admin/Promotions";

const page = zoneScreen("/admin/promotions", <AdminPromotions />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
