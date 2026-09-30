import { zoneScreen } from "../../../../_zones/zonePage";
import { CourseOverviewScreen } from "../../../../../src/zones/learn";

const page = zoneScreen(({ courseId }) => `/academy/mes-formations/${courseId}`, CourseOverviewScreen);
export const generateMetadata = page.generateMetadata;
export default page.Page;
