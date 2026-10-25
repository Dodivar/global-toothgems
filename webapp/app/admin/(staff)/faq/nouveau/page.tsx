import { zoneScreen } from "../../../../_zones/zonePage";
import { AdminFaqEdit } from "../../../../../src/screens/admin/AdminFaqEdit";

const page = zoneScreen("/admin/faq/nouveau", <AdminFaqEdit isNew />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
