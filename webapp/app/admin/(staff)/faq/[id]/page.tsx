import { zoneScreen } from "../../../../_zones/zonePage";
import { AdminFaqEdit } from "../../../../../src/screens/admin/AdminFaqEdit";

const page = zoneScreen(({ id }) => `/admin/faq/${id}`, <AdminFaqEdit />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
