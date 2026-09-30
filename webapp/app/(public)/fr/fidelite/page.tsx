import { publicScreen } from "../../../_public/publicPage";
import { Loyalty } from "../../../../src/screens/Loyalty";

const page = publicScreen("loyalty", "fr", <Loyalty />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
