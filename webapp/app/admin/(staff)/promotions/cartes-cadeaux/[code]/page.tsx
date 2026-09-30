import { zoneScreen } from "../../../../../_zones/zonePage";
import { AdminGiftCardDetailScreen } from "../../../../../../src/zones/admin";

const page = zoneScreen(({ code }) => `/admin/promotions/cartes-cadeaux/${code}`, AdminGiftCardDetailScreen);
export const generateMetadata = page.generateMetadata;
export default page.Page;
