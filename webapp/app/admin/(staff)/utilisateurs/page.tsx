import { zoneScreen } from "../../../_zones/zonePage";
import { AdminUsersScreen } from "../../../../src/zones/admin";

const page = zoneScreen("/admin/utilisateurs", AdminUsersScreen);
export const generateMetadata = page.generateMetadata;
export default page.Page;
