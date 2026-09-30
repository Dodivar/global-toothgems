import { zoneScreen } from "../../../_zones/zonePage";
import { Users as AdminUsers } from "../../../../src/screens/admin/Users";

const page = zoneScreen("/admin/utilisateurs", <AdminUsers />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
