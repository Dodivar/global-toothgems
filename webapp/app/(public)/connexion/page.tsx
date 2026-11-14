import { addressMetadata } from "../../_public/metadata";
import { Login } from "../../../src/screens/Login";
import { BrowserOnly } from "../../../src/zones/BrowserOnly";
import { preloadAuthPhoto } from "../../../src/components/auth/authPhoto";

export const metadata = addressMetadata("/connexion");

export default function Page() {
  preloadAuthPhoto();
  return (
    <BrowserOnly>
      <Login />
    </BrowserOnly>
  );
}
