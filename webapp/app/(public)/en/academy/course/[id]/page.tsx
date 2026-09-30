import { publicScreen } from "../../../../../_public/publicPage";
import { CourseScreen } from "../../../../../../src/zones/public";

const page = publicScreen("course", "en", CourseScreen);
export const generateMetadata = page.generateMetadata;
export default page.Page;
