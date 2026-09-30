import { zoneScreen } from "../../../_zones/zonePage";
import { Settings as AdminSettings } from "../../../../src/screens/admin/Settings";

const page = zoneScreen("/admin/parametres", <AdminSettings />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
