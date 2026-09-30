import { zoneScreen } from "../../../../_zones/zonePage";
import { AdminTrainingBuilderScreen } from "../../../../../src/zones/admin";

const page = zoneScreen(({ id }) => `/admin/formations/${id}`, AdminTrainingBuilderScreen);
export const generateMetadata = page.generateMetadata;
export default page.Page;
