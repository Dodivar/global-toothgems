import { zoneScreen } from "../../../../../_zones/zonePage";
import { GiftCardSettings as AdminGiftCardSettings } from "../../../../../../src/screens/admin/GiftCardSettings";

const page = zoneScreen("/admin/promotions/cartes-cadeaux/configuration", <AdminGiftCardSettings />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
