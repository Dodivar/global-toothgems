import { zoneScreen } from "../../../../_zones/zonePage";
import { AdminProductNewScreen } from "../../../../../src/zones/admin";

const page = zoneScreen("/admin/produits/nouveau", AdminProductNewScreen);
export const generateMetadata = page.generateMetadata;
export default page.Page;
