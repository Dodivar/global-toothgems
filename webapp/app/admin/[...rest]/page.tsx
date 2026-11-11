import { zoneScreen } from "../../_zones/zonePage";
import { NotFound } from "../../../src/screens/NotFound";

/* Checked like the back office's pages: anyone who is not staff gets the site's own 404 first. */
const page = zoneScreen(({ rest }) => `/admin/${rest}`, <NotFound />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
