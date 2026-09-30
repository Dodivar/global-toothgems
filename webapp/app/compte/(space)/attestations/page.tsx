import { zoneScreen } from "../../../_zones/zonePage";
import { Certificates } from "../../../../src/screens/account/Certificates";

const page = zoneScreen("/compte/attestations", <Certificates />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
