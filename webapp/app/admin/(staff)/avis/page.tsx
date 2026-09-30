import { zoneScreen } from "../../../_zones/zonePage";
import { AdminReviewsScreen } from "../../../../src/zones/admin";

const page = zoneScreen("/admin/avis", AdminReviewsScreen);
export const generateMetadata = page.generateMetadata;
export default page.Page;
