import { zoneScreen } from "../../../../_zones/zonePage";
import { PromotionEditor as AdminPromotionEditor } from "../../../../../src/screens/admin/PromotionEditor";

const page = zoneScreen("/admin/promotions/nouvelle", <AdminPromotionEditor />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
