import { zoneScreen } from "../../../../_zones/zonePage";
import { AdminProductEditScreen } from "../../../../../src/zones/admin";

const page = zoneScreen(({ id }) => `/admin/produits/${id}`, AdminProductEditScreen);
export const generateMetadata = page.generateMetadata;
export default page.Page;
