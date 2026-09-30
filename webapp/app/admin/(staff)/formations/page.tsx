import { zoneScreen } from "../../../_zones/zonePage";
import { AdminTrainingScreen } from "../../../../src/zones/admin";

const page = zoneScreen("/admin/formations", AdminTrainingScreen);
export const generateMetadata = page.generateMetadata;
export default page.Page;
