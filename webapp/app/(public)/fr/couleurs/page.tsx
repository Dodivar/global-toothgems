import { publicScreen } from "../../../_public/publicPage";
import { ColoursScreen } from "../../../../src/zones/public";

const page = publicScreen("colours", "fr", ColoursScreen);
export const generateMetadata = page.generateMetadata;
export default page.Page;
