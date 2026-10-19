import { zoneScreen } from "../../../_zones/zonePage";
import { AdminGlowbook } from "../../../../src/screens/admin/AdminGlowbook";

const page = zoneScreen("/admin/glowbook", <AdminGlowbook />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
