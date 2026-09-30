import { zoneScreen } from "../../../_zones/zonePage";
import { AdminOrdersScreen } from "../../../../src/zones/admin";

const page = zoneScreen("/admin/commandes", AdminOrdersScreen);
export const generateMetadata = page.generateMetadata;
export default page.Page;
