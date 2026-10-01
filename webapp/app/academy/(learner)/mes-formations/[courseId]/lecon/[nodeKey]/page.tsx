import { zoneScreen } from "../../../../../../_zones/zonePage";
import { LessonPlayer } from "../../../../../../../src/screens/learn/LessonPlayer";

const page = zoneScreen(({ courseId, nodeKey }) => `/academy/mes-formations/${courseId}/lecon/${nodeKey}`, <LessonPlayer />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
