import { zoneScreen } from "../../../../../_zones/zonePage";
import { GiftCardDetail as AdminGiftCardDetail } from "../../../../../../src/screens/admin/GiftCardDetail";

const page = zoneScreen(({ code }) => `/admin/promotions/cartes-cadeaux/${code}`, <AdminGiftCardDetail />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
