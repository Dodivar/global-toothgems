import { zoneScreen } from "../../../../../../_zones/zonePage";
import { CampaignEditor as AdminCampaignEditor } from "../../../../../../../src/screens/admin/CampaignEditor";

const page = zoneScreen(({ id }) => `/admin/promotions/campagnes/${id}/modifier`, <AdminCampaignEditor />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
