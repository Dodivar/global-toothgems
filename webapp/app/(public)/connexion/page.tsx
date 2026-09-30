import { addressMetadata } from "../../_public/metadata";
import { LoginScreen } from "../../../src/zones/public";

export const metadata = addressMetadata("/connexion");

export default function Page() {
  return <LoginScreen />;
}
