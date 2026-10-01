import { zoneScreen } from "../../../../_zones/zonePage";
import { TrainingMedia as AdminTrainingMedia } from "../../../../../src/screens/admin/TrainingMedia";

const page = zoneScreen("/admin/formations/medias", <AdminTrainingMedia />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
