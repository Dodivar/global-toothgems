import { zoneScreen } from "../../../_zones/zonePage";
import { Training as AdminTraining } from "../../../../src/screens/admin/Training";

const page = zoneScreen("/admin/formations", <AdminTraining />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
