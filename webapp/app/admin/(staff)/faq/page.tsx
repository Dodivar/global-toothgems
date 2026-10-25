import { zoneScreen } from "../../../_zones/zonePage";
import { AdminFaq } from "../../../../src/screens/admin/AdminFaq";

const page = zoneScreen("/admin/faq", <AdminFaq />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
