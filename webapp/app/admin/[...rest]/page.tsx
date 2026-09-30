import { zoneScreen } from "../../_zones/zonePage";
import { NotFound } from "../../../src/screens/NotFound";

/* Checked like the back office's pages: a signed-out visitor is sent to sign in. */
const page = zoneScreen(({ rest }) => `/admin/${rest}`, <NotFound />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
