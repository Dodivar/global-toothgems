import { zoneScreen } from "../../../../../_zones/zonePage";
import { AdminTrainingReviewScreen } from "../../../../../../src/zones/admin";

const page = zoneScreen(({ id }) => `/admin/formations/${id}/publication`, AdminTrainingReviewScreen);
export const generateMetadata = page.generateMetadata;
export default page.Page;
