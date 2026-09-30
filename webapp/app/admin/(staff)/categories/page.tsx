import { zoneScreen } from "../../../_zones/zonePage";
import { AdminCategoriesScreen } from "../../../../src/zones/admin";

const page = zoneScreen("/admin/categories", AdminCategoriesScreen);
export const generateMetadata = page.generateMetadata;
export default page.Page;
