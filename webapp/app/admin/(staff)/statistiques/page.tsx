import { zoneScreen } from "../../../_zones/zonePage";
import { AdminStatisticsScreen } from "../../../../src/zones/admin";

const page = zoneScreen("/admin/statistiques", AdminStatisticsScreen);
export const generateMetadata = page.generateMetadata;
export default page.Page;
