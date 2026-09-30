import { zoneScreen } from "../../../../../_zones/zonePage";
import { CourseCompletedScreen } from "../../../../../../src/zones/learn";

const page = zoneScreen(({ courseId }) => `/academy/mes-formations/${courseId}/terminee`, CourseCompletedScreen);
export const generateMetadata = page.generateMetadata;
export default page.Page;
