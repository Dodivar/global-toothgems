import { zoneScreen } from "../../_zones/zonePage";
import { AdminDashboardScreen } from "../../../src/zones/admin";

const page = zoneScreen("/admin", AdminDashboardScreen);
export const generateMetadata = page.generateMetadata;
export default page.Page;
