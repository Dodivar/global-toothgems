import { zoneScreen } from "../../../../../_zones/zonePage";
import { AdminTrainingPreviewScreen } from "../../../../../../src/zones/admin";

const page = zoneScreen(({ id }) => `/admin/formations/${id}/apercu`, AdminTrainingPreviewScreen);
export const generateMetadata = page.generateMetadata;
export default page.Page;
