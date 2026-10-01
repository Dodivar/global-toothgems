import { zoneScreen } from "../../../_zones/zonePage";
import { ResumeTraining } from "../../../../src/screens/learn/ResumeTraining";

const page = zoneScreen("/academy/lecon", <ResumeTraining />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
