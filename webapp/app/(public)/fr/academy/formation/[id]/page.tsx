import { publicScreen } from "../../../../../_public/publicPage";
import { CourseDetail } from "../../../../../../src/screens/CourseDetail";

const page = publicScreen("course", "fr", <CourseDetail />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
