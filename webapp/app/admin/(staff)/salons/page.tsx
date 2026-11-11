import { zoneScreen } from "../../../_zones/zonePage";
import { AdminLounge } from "../../../../src/screens/admin/AdminLounge";

const page = zoneScreen("/admin/salons", <AdminLounge />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
