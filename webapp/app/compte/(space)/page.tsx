import { zoneScreen } from "../../_zones/zonePage";
import { DashboardScreen } from "../../../src/zones/account";

const page = zoneScreen("/compte", DashboardScreen);
export const generateMetadata = page.generateMetadata;
export default page.Page;
