import { LogIn, UserPlus } from "lucide-react";
import { useLocation, useNavigate } from "../../../lib/navigation";
import { useTranslation } from "react-i18next";
import { Button } from "../../ui/Button";
import { EmptyState } from "./EmptyState";

/**
 * Saved creations and Gem Groups belong to an account. Signed out, the
 * editor still works (its draft stays on this device); the library explains
 * why it is empty and brings the visitor back here after signing in.
 */
export function SignInPrompt({
  compact = false,
  onNavigate,
  title,
  body,
  returnTo,
}: {
  compact?: boolean;
  onNavigate?: () => void;
  /** Where signing in leads back to; the current path by default. A shared design passes its fragment too. */
  returnTo?: string;
  /** Wording for a context other than the library (feedback, for one). */
  title?: string;
  body?: string;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const go = (to: string) => {
    onNavigate?.();
    navigate(to, { state: { from: returnTo ?? pathname } });
  };

  return (
    <EmptyState
      compact={compact}
      title={title ?? t("studio.workspace.signIn.title")}
      body={body ?? t("studio.workspace.signIn.body")}
      actions={
        <>
          <Button variant="primary" size="sm" iconLeft={LogIn} onClick={() => go("/connexion")}>
            {t("studio.workspace.signIn.cta")}
          </Button>
          <Button variant="outline" size="sm" iconLeft={UserPlus} onClick={() => go("/inscription")}>
            {t("studio.workspace.signIn.register")}
          </Button>
        </>
      }
    />
  );
}
