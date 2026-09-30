import { zoneScreen } from "../../_zones/zonePage";
import { AdminLoginScreen } from "../../../src/zones/admin";

/** The back office's access screen, open (no gate for `/admin/connexion`). */
const page = zoneScreen("/admin/connexion", AdminLoginScreen);
export const generateMetadata = page.generateMetadata;
export default page.Page;
