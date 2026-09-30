import { zoneScreen } from "../../../_zones/zonePage";
import { Customers as AdminCustomers } from "../../../../src/screens/admin/Customers";

const page = zoneScreen("/admin/clients", <AdminCustomers />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
