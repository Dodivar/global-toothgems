import { publicScreen } from "../../../_public/publicPage";
import { AboutScreen } from "../../../../src/zones/public";

const page = publicScreen("about", "en", AboutScreen);
export const generateMetadata = page.generateMetadata;
export default page.Page;
