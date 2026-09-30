import { zoneScreen } from "../../../_zones/zonePage";
import { Statistics as AdminStatistics } from "../../../../src/screens/admin/Statistics";

const page = zoneScreen("/admin/statistiques", <AdminStatistics />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
