import { zoneScreen } from "../../../../_zones/zonePage";
import { TrainingBuilder as AdminTrainingBuilder } from "../../../../../src/screens/admin/TrainingBuilder";

const page = zoneScreen(({ id }) => `/admin/formations/${id}`, <AdminTrainingBuilder />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
