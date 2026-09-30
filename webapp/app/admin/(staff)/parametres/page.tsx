import { zoneScreen } from "../../../_zones/zonePage";
import { AdminSettingsScreen } from "../../../../src/zones/admin";

const page = zoneScreen("/admin/parametres", AdminSettingsScreen);
export const generateMetadata = page.generateMetadata;
export default page.Page;
