import { addressMetadata } from "../../_public/metadata";
import { RegisterScreen } from "../../../src/zones/public";

export const metadata = addressMetadata("/inscription");

export default function Page() {
  return <RegisterScreen />;
}
