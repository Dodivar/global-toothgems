import { addressMetadata } from "../../_public/metadata";
import { Register } from "../../../src/screens/Register";
import { BrowserOnly } from "../../../src/zones/BrowserOnly";
import { preloadAuthPhoto } from "../../../src/components/auth/authPhoto";

export const metadata = addressMetadata("/inscription");

export default function Page() {
  preloadAuthPhoto();
  return (
    <BrowserOnly>
      <Register />
    </BrowserOnly>
  );
}
