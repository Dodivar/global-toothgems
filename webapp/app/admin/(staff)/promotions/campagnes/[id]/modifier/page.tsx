import { zoneScreen } from "../../../../../../_zones/zonePage";
import { AdminCampaignEditorScreen } from "../../../../../../../src/zones/admin";

const page = zoneScreen(({ id }) => `/admin/promotions/campagnes/${id}/modifier`, AdminCampaignEditorScreen);
export const generateMetadata = page.generateMetadata;
export default page.Page;
