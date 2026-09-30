import { zoneScreen } from "../../../../../_zones/zonePage";
import { TrainingReview as AdminTrainingReview } from "../../../../../../src/screens/admin/TrainingReview";

const page = zoneScreen(({ id }) => `/admin/formations/${id}/publication`, <AdminTrainingReview />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
