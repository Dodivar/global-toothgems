import { addressMetadata } from "../../_public/metadata";
import { Maintenance } from "../../../src/screens/Maintenance";
import { BrowserOnly } from "../../../src/zones/BrowserOnly";

export const metadata = addressMetadata("/maintenance");

export default function Page() {
  return (
    <BrowserOnly>
      <Maintenance />
    </BrowserOnly>
  );
}
