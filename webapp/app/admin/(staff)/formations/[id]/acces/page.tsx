import { zoneScreen } from "../../../../../_zones/zonePage";
import { TrainingAccess as AdminTrainingAccess } from "../../../../../../src/screens/admin/TrainingAccess";

const page = zoneScreen(({ id }) => `/admin/formations/${id}/acces`, <AdminTrainingAccess />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
