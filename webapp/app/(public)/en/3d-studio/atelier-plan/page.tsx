import { publicScreen } from "../../../../_public/publicPage";
import { StudioAtelier } from "../../../../../src/screens/StudioAtelier";

const page = publicScreen("studioAtelier", "en", <StudioAtelier />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
