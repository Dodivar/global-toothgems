import { addressMetadata } from "../../_public/metadata";
import { ForgotPasswordScreen } from "../../../src/zones/public";

export const metadata = addressMetadata("/mot-de-passe-oublie");

export default function Page() {
  return <ForgotPasswordScreen />;
}
