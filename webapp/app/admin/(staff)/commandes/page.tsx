import { zoneScreen } from "../../../_zones/zonePage";
import { Orders as AdminOrders } from "../../../../src/screens/admin/Orders";

const page = zoneScreen("/admin/commandes", <AdminOrders />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
