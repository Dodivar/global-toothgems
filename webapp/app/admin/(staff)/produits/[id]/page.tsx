import { zoneScreen } from "../../../../_zones/zonePage";
import { AdminProductEdit } from "../../../../../src/screens/admin/AdminProductEdit";

const page = zoneScreen(({ id }) => `/admin/produits/${id}`, <AdminProductEdit />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
