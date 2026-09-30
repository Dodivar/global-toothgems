import { publicScreen } from "../../../_public/publicPage";
import { StudioScreen } from "../../../../src/zones/public";

const page = publicScreen("studio", "fr", StudioScreen);
export const generateMetadata = page.generateMetadata;
export default page.Page;
