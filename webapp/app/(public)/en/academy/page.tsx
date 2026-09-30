import { publicScreen } from "../../../_public/publicPage";
import { AcademyScreen } from "../../../../src/zones/public";

const page = publicScreen("academy", "en", AcademyScreen);
export const generateMetadata = page.generateMetadata;
export default page.Page;
