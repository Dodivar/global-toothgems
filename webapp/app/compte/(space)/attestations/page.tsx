import { zoneScreen } from "../../../_zones/zonePage";
import { CertificatesScreen } from "../../../../src/zones/account";

const page = zoneScreen("/compte/attestations", CertificatesScreen);
export const generateMetadata = page.generateMetadata;
export default page.Page;
