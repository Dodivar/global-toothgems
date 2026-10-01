import { zoneScreen } from "../../../_zones/zonePage";
import { AdminProducts } from "../../../../src/screens/admin/AdminProducts";

const page = zoneScreen("/admin/produits", <AdminProducts />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
