import { addressMetadata } from "../../../_public/metadata";
import { NewsletterConfirm } from "../../../../src/screens/NewsletterConfirm";
import { BrowserOnly } from "../../../../src/zones/BrowserOnly";

export const metadata = addressMetadata("/newsletter/confirmer");

export default function Page() {
  return (
    <BrowserOnly>
      <NewsletterConfirm />
    </BrowserOnly>
  );
}
