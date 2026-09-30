import { publicScreen } from "../../../_public/publicPage";
import { About } from "../../../../src/screens/legal/About";

const page = publicScreen("about", "fr", <About />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
