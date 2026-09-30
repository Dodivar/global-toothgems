import { zoneScreen } from "../../../../../_zones/zonePage";
import { CampaignDetail as AdminCampaignDetail } from "../../../../../../src/screens/admin/CampaignDetail";

const page = zoneScreen(({ id }) => `/admin/promotions/campagnes/${id}`, <AdminCampaignDetail />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
