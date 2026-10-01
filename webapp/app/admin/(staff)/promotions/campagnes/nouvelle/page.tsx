import { zoneScreen } from "../../../../../_zones/zonePage";
import { CampaignEditor as AdminCampaignEditor } from "../../../../../../src/screens/admin/CampaignEditor";

const page = zoneScreen("/admin/promotions/campagnes/nouvelle", <AdminCampaignEditor />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
