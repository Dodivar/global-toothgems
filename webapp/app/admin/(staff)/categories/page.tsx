import { zoneScreen } from "../../../_zones/zonePage";
import { AdminCategories } from "../../../../src/screens/admin/AdminCategories";

const page = zoneScreen("/admin/categories", <AdminCategories />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
