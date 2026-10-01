import { publicScreen } from "../../../_public/publicPage";
import { Shapes } from "../../../../src/screens/Shapes";

const page = publicScreen("shapes", "en", <Shapes />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
