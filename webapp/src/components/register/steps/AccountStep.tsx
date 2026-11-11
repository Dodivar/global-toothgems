import { useTranslation } from "react-i18next";
import { Link } from "../../../lib/navigation";
import { PasswordField, TextField } from "../Field";
import { PasswordStrength } from "../PasswordStrength";
import { GoogleMark } from "../GoogleMark";
import { AppleMark } from "../../auth/AppleMark";
import { LastUsedFrame } from "../../auth/LastUsedFrame";
import type { SignInMethod } from "../../../lib/lastSignInMethod";
import { StepHeading } from "./StepHeading";
import { suggestEmail, validateField } from "../../../lib/registration";
import type { StepProps } from "./types";

/**
 * Step 1 — email and password, or Google / Apple.
 *
 * The providers sit first because they are the shortest path (they leave for
 * the provider and come back signed in); the email route follows a labelled
 * divider. Apple is offered once the owner has switched it on (`onApple`).
 */
export function AccountStep({
  data,
  errors,
  set,
  blur,
  fieldRef,
  headingRef,
  touched,
  emailTaken,
  onGoogle,
  onApple,
  lastMethod,
  signInState,
  onForgotPassword,
}: StepProps & {
  touched: (name: "email" | "password" | "confirmPassword") => boolean;
  emailTaken: boolean;
  onGoogle: () => void;
  onApple?: () => void;
  lastMethod: SignInMethod | null;
  signInState: unknown;
  onForgotPassword: () => void;
}) {
  const { t } = useTranslation();
  const suggestion = suggestEmail(data.email);
  const emailValid = !validateField("email", data) && !emailTaken;
  const passwordValid = !validateField("password", data);
  const confirmValid = !validateField("confirmPassword", data) && passwordValid;

  return (
    <div className="grid gap-5">
      <StepHeading headingRef={headingRef} title={t("register.account.title")} body={t("register.account.body")} />

      <>
          <LastUsedFrame active={lastMethod === "google"}>
            {(describedBy) => (
              <button
                type="button"
                onClick={onGoogle}
                aria-describedby={describedBy}
                className="gt-google-btn flex h-[52px] w-full items-center justify-center gap-3 rounded-[var(--radius-control)] border border-[var(--border-default)] bg-white px-5 text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)] shadow-[var(--shadow-xs)] transition-[border-color,box-shadow,background-color] duration-[var(--duration-fast)] hover:border-[var(--gt-ink-400)] hover:shadow-[var(--shadow-sm)] active:scale-[0.99]"
              >
                <GoogleMark size={19} />
                {t("register.google.cta")}
              </button>
            )}
          </LastUsedFrame>

          {onApple && (
            <LastUsedFrame active={lastMethod === "apple"}>
              {(describedBy) => (
                <button
                  type="button"
                  onClick={onApple}
                  aria-describedby={describedBy}
                  className="flex h-[52px] w-full items-center justify-center gap-3 rounded-[var(--radius-control)] border border-black bg-black px-5 text-[length:var(--text-body-sm)] font-semibold text-white shadow-[var(--shadow-xs)] transition-[background-color,box-shadow] duration-[var(--duration-fast)] hover:bg-[#1f1f1f] hover:shadow-[var(--shadow-sm)] active:scale-[0.99]"
                >
                  <AppleMark size={19} />
                  {t("register.apple.cta")}
                </button>
              )}
            </LastUsedFrame>
          )}

          <div className="flex items-center gap-3 text-[length:var(--text-caption)] text-[var(--text-muted)]" role="separator" aria-label={t("register.account.divider")}>
            <span aria-hidden="true" className="h-px flex-1 bg-[var(--border-subtle)]" />
            <span aria-hidden="true">{t("register.account.divider")}</span>
            <span aria-hidden="true" className="h-px flex-1 bg-[var(--border-subtle)]" />
          </div>

          <TextField
            ref={fieldRef("email")}
            id="reg-email"
            label={t("register.fields.email")}
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder={t("register.fields.emailPlaceholder")}
            value={data.email}
            onChange={(e) => set("email", e.target.value)}
            onBlur={() => blur("email")}
            error={errors.email}
            success={emailValid && touched("email")}
            hint={t("register.fields.emailHint")}
            after={
              <>
                {suggestion && !errors.email && (
                  <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-body)]">
                    {t("register.fields.didYouMean")}{" "}
                    <button
                      type="button"
                      onClick={() => set("email", suggestion)}
                      className="font-semibold text-[var(--text-primary)] underline decoration-1 underline-offset-4 hover:text-[var(--text-link-hover)]"
                    >
                      {suggestion}
                    </button>
                    ?
                  </p>
                )}
                {emailTaken && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 pl-5 text-[length:var(--text-caption)]">
                    <Link
                      to="/connexion"
                      state={signInState}
                      className="font-semibold text-[var(--text-primary)] underline decoration-1 underline-offset-4 hover:text-[var(--text-link-hover)]"
                    >
                      {t("register.signInInstead")}
                    </Link>
                    <button
                      type="button"
                      onClick={onForgotPassword}
                      className="font-semibold text-[var(--text-primary)] underline decoration-1 underline-offset-4 hover:text-[var(--text-link-hover)]"
                    >
                      {t("register.forgotPassword")}
                    </button>
                  </div>
                )}
              </>
            }
          />

          <PasswordField
            ref={fieldRef("password")}
            id="reg-password"
            label={t("register.fields.password")}
            autoComplete="new-password"
            value={data.password}
            onChange={(e) => set("password", e.target.value)}
            onBlur={() => blur("password")}
            error={errors.password}
            success={passwordValid && touched("password")}
            describedBy="reg-password-strength"
            after={<PasswordStrength id="reg-password-strength" value={data.password} errorShown={!!errors.password} />}
          />

          <PasswordField
            ref={fieldRef("confirmPassword")}
            id="reg-confirm"
            label={t("register.fields.confirmPassword")}
            autoComplete="new-password"
            value={data.confirmPassword}
            onChange={(e) => set("confirmPassword", e.target.value)}
            onBlur={() => blur("confirmPassword")}
            error={errors.confirmPassword}
            success={confirmValid && data.confirmPassword.length > 0}
            successMessage={t("register.fields.passwordsMatch")}
          />
      </>
    </div>
  );
}
