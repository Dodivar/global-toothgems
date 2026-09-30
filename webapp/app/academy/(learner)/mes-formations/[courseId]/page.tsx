import { zoneScreen } from "../../../../_zones/zonePage";
import { CourseOverview } from "../../../../../src/screens/learn/CourseOverview";

const page = zoneScreen(({ courseId }) => `/academy/mes-formations/${courseId}`, <CourseOverview />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
