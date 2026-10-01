import { zoneScreen } from "../../../../../_zones/zonePage";
import { TrainingPreview as AdminTrainingPreview } from "../../../../../../src/screens/admin/TrainingPreview";

const page = zoneScreen(({ id }) => `/admin/formations/${id}/apercu`, <AdminTrainingPreview />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
