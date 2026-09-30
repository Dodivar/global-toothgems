import { publicScreen } from "../../../_public/publicPage";
import { HelpScreen } from "../../../../src/zones/public";

const page = publicScreen("help", "fr", HelpScreen);
export const generateMetadata = page.generateMetadata;
export default page.Page;
