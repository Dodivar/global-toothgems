import { publicScreen } from "../../../../_public/publicPage";
import { StudioLanding } from "../../../../../src/screens/StudioLanding";

const page = publicScreen("studioLanding", "en", <StudioLanding />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
