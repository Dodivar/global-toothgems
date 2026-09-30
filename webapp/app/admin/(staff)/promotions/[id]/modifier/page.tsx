import { zoneScreen } from "../../../../../_zones/zonePage";
import { PromotionEditor as AdminPromotionEditor } from "../../../../../../src/screens/admin/PromotionEditor";

const page = zoneScreen(({ id }) => `/admin/promotions/${id}/modifier`, <AdminPromotionEditor />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
