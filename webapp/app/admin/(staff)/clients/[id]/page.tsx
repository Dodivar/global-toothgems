import { zoneScreen } from "../../../../_zones/zonePage";
import { AdminCustomerDetailScreen } from "../../../../../src/zones/admin";

const page = zoneScreen(({ id }) => `/admin/clients/${id}`, AdminCustomerDetailScreen);
export const generateMetadata = page.generateMetadata;
export default page.Page;
