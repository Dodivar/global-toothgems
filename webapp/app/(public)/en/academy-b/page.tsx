import { publicScreen } from "../../../_public/publicPage";
import { AcademyB } from "../../../../src/screens/AcademyB";

const page = publicScreen("academyB", "en", <AcademyB />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
