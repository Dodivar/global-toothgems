import { zoneScreen } from "../../../../../_zones/zonePage";
import { CourseCompleted } from "../../../../../../src/screens/learn/CourseCompleted";

const page = zoneScreen(({ courseId }) => `/academy/mes-formations/${courseId}/terminee`, <CourseCompleted />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
