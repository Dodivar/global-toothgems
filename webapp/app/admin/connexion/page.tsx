import { zoneScreen } from "../../_zones/zonePage";
import { AdminLogin } from "../../../src/screens/admin/AdminLogin";

/** The back office's access screen, open (no gate for `/admin/connexion`). */
const page = zoneScreen("/admin/connexion", <AdminLogin />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
