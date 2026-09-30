import { publicScreen } from "../../../../_public/publicPage";
import { StudioSubscribeScreen } from "../../../../../src/zones/public";

const page = publicScreen("studioSubscribe", "fr", StudioSubscribeScreen);
export const generateMetadata = page.generateMetadata;
export default page.Page;
