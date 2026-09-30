import { zoneScreen } from "../../../../_zones/zonePage";
import { AdminProductNew } from "../../../../../src/screens/admin/AdminProductNew";

const page = zoneScreen("/admin/produits/nouveau", <AdminProductNew />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
