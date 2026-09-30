import { zoneScreen } from "../../../../../../_zones/zonePage";
import { LessonPlayerScreen } from "../../../../../../../src/zones/learn";

const page = zoneScreen(({ courseId, nodeKey }) => `/academy/mes-formations/${courseId}/lecon/${nodeKey}`, LessonPlayerScreen);
export const generateMetadata = page.generateMetadata;
export default page.Page;
