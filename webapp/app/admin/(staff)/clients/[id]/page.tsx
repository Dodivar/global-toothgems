import { zoneScreen } from "../../../../_zones/zonePage";
import { CustomerDetail as AdminCustomerDetail } from "../../../../../src/screens/admin/CustomerDetail";

const page = zoneScreen(({ id }) => `/admin/clients/${id}`, <AdminCustomerDetail />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
