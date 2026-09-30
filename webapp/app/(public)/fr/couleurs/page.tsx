import { publicScreen } from "../../../_public/publicPage";
import { Colors } from "../../../../src/screens/Colors";

const page = publicScreen("colours", "fr", <Colors />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
