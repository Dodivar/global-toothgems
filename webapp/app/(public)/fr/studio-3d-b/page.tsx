import { publicScreen } from "../../../_public/publicPage";
import { StudioAlt } from "../../../../src/screens/StudioAlt";

const page = publicScreen("studioAlt", "fr", <StudioAlt />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
