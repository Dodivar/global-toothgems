import { zoneScreen } from "../../../../../_zones/zonePage";
import { AdminGiftCardSettingsScreen } from "../../../../../../src/zones/admin";

const page = zoneScreen("/admin/promotions/cartes-cadeaux/configuration", AdminGiftCardSettingsScreen);
export const generateMetadata = page.generateMetadata;
export default page.Page;
