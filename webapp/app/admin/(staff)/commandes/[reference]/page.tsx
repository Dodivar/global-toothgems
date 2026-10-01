import { zoneScreen } from "../../../../_zones/zonePage";
import { OrderDetail as AdminOrderDetail } from "../../../../../src/screens/admin/OrderDetail";

const page = zoneScreen(({ reference }) => `/admin/commandes/${reference}`, <AdminOrderDetail />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
