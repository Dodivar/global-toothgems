import { zoneScreen } from "../../../../_zones/zonePage";
import { AdminOrderDetailScreen } from "../../../../../src/zones/admin";

const page = zoneScreen(({ reference }) => `/admin/commandes/${reference}`, AdminOrderDetailScreen);
export const generateMetadata = page.generateMetadata;
export default page.Page;
