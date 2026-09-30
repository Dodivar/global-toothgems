import { zoneScreen } from "../../../../../_zones/zonePage";
import { AdminCampaignDetailScreen } from "../../../../../../src/zones/admin";

const page = zoneScreen(({ id }) => `/admin/promotions/campagnes/${id}`, AdminCampaignDetailScreen);
export const generateMetadata = page.generateMetadata;
export default page.Page;
