import { zoneScreen } from "../../../_zones/zonePage";
import { AdminCustomersScreen } from "../../../../src/zones/admin";

const page = zoneScreen("/admin/clients", AdminCustomersScreen);
export const generateMetadata = page.generateMetadata;
export default page.Page;
