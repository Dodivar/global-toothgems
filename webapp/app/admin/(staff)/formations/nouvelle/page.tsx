import { zoneScreen } from "../../../../_zones/zonePage";
import { TrainingNew as AdminTrainingNew } from "../../../../../src/screens/admin/TrainingNew";

const page = zoneScreen("/admin/formations/nouvelle", <AdminTrainingNew />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
