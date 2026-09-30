import { zoneScreen } from "../../../../_zones/zonePage";
import { PromotionDetail as AdminPromotionDetail } from "../../../../../src/screens/admin/PromotionDetail";

const page = zoneScreen(({ id }) => `/admin/promotions/${id}`, <AdminPromotionDetail />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
