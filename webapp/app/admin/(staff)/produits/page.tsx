import { zoneScreen } from "../../../_zones/zonePage";
import { AdminProductsScreen } from "../../../../src/zones/admin";

const page = zoneScreen("/admin/produits", AdminProductsScreen);
export const generateMetadata = page.generateMetadata;
export default page.Page;
