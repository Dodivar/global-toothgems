import { zoneScreen } from "../../_zones/zonePage";
import { AdminNotFoundScreen } from "../../../src/zones/admin";

/* Checked like the back office's pages: a signed-out visitor is sent to sign in. */
const page = zoneScreen(({ rest }) => `/admin/${rest}`, AdminNotFoundScreen);
export const generateMetadata = page.generateMetadata;
export default page.Page;
