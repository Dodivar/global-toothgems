import { zoneScreen } from "../../../_zones/zonePage";
import { AdminBackInStock } from "../../../../src/screens/admin/AdminBackInStock";

const page = zoneScreen("/admin/alertes-stock", <AdminBackInStock />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
