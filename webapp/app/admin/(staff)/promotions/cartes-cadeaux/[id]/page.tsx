import { zoneScreen } from "../../../../../_zones/zonePage";
import { GiftCardDetail as AdminGiftCardDetail } from "../../../../../../src/screens/admin/GiftCardDetail";

const page = zoneScreen(({ id }) => `/admin/promotions/cartes-cadeaux/${id}`, <AdminGiftCardDetail />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
