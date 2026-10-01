import { zoneScreen } from "../../../_zones/zonePage";
import { Reviews as AdminReviews } from "../../../../src/screens/admin/Reviews";

const page = zoneScreen("/admin/avis", <AdminReviews />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
