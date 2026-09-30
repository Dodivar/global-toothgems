import { zoneScreen } from "../../../../_zones/zonePage";
import { AdminTrainingNewScreen } from "../../../../../src/zones/admin";

const page = zoneScreen("/admin/formations/nouvelle", AdminTrainingNewScreen);
export const generateMetadata = page.generateMetadata;
export default page.Page;
