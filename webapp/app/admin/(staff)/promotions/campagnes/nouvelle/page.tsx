import { zoneScreen } from "../../../../../_zones/zonePage";
import { AdminCampaignEditorScreen } from "../../../../../../src/zones/admin";

const page = zoneScreen("/admin/promotions/campagnes/nouvelle", AdminCampaignEditorScreen);
export const generateMetadata = page.generateMetadata;
export default page.Page;
