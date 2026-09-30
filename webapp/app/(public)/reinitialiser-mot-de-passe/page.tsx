import { addressMetadata } from "../../_public/metadata";
import { ResetPasswordScreen } from "../../../src/zones/public";

export const metadata = addressMetadata("/reinitialiser-mot-de-passe");

export default function Page() {
  return <ResetPasswordScreen />;
}
