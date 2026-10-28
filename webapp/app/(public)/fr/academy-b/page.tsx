import { publicScreen } from "../../../_public/publicPage";
import { AcademyB } from "../../../../src/screens/AcademyB";

const page = publicScreen("academyB", "fr", <AcademyB />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
