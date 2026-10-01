import { zoneScreen } from "../../_zones/zonePage";
import { AdminDashboard } from "../../../src/screens/admin/AdminDashboard";

const page = zoneScreen("/admin", <AdminDashboard />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
