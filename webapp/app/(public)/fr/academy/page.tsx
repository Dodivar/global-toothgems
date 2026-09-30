import { publicScreen } from "../../../_public/publicPage";
import { AcademyScreen } from "../../../../src/zones/public";

const page = publicScreen("academy", "fr", AcademyScreen);
export const generateMetadata = page.generateMetadata;
export default page.Page;
