import { zoneScreen } from "../../../../_zones/zonePage";
import { PromotionPreview as AdminPromotionPreview } from "../../../../../src/screens/admin/PromotionPreview";

const page = zoneScreen("/admin/promotions/apercu", <AdminPromotionPreview />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
