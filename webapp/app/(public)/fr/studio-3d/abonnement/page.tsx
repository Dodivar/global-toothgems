import { publicScreen } from "../../../../_public/publicPage";
import { StudioSubscribe } from "../../../../../src/screens/StudioSubscribe";

const page = publicScreen("studioSubscribe", "fr", <StudioSubscribe />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
