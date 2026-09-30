import { addressMetadata } from "../../_public/metadata";
import { ConfirmAccount } from "../../../src/screens/ConfirmAccount";
import { BrowserOnly } from "../../../src/zones/BrowserOnly";

export const metadata = addressMetadata("/confirmation-compte");

export default function Page() {
  return (
    <BrowserOnly>
      <ConfirmAccount />
    </BrowserOnly>
  );
}
