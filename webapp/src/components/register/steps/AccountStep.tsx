import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { BadgeCheck } from "lucide-react";
import { PasswordField, TextField } from "../Field";
import { PasswordStrength } from "../PasswordStrength";
import { GoogleMark } from "../GoogleDialog";
import { StepHeading } from "./StepHeading";
import { suggestEmail, validateField } from "../../../lib/registration";
import type { StepProps } from "./types";

/**
 * Step 1 — email and password, or Google.
 *
 * Google sits first because it is the shortest path; the email route follows a
 * labelled divider. Once Google has supplied the address, the password fields
 * are replaced by a confirmation card: asking for a password there would
 * contradict the choice the visitor just made.
 */
export function AccountStep({
  data,
  errors,
  set,
  blur,
  fieldRef,
  headingRef,
  touched,
  checkingEmail,
  emailTaken,
  viaGoogle,
  onGoogle,
  onUseEmail,
  signInState,
  onForgotPassword,
}: StepProps & {
  touched: (name: "email" | "password" | "confirmPassword") => boolean;
  checkingEmail: boolean;
  emailTaken: boolean;
  viaGoogle: boolean;
  onGoogle: () => void;
  onUseEmail: () => void;
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

      {viaGoogle ? (
        <div className="grid gap-3 rounded-[var(--radius-md)] border border-[var(--gt-emerald-300)] bg-[var(--status-success-bg)] p-4">
          <p className="m-0 flex items-start gap-3 text-[length:var(--text-body-sm)] text-[var(--text-primary)]">
            <span aria-hidden="true" className="grid h-9 w-9 flex-none place-items-center rounded-full bg-white shadow-[var(--shadow-xs)]">
              <GoogleMark size={18} />
            </span>
            <span className="grid gap-0.5">
              <strong className="flex items-center gap-1.5">
                <BadgeCheck size={15} aria-hidden="true" className="text-[var(--status-success-fg)]" />
                {t("register.account.googleConnected")}
              </strong>
              <span className="break-all text-[var(--text-body)]">{data.email}</span>
              <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("register.account.googleNoPassword")}</span>
            </span>
          </p>
          <button
            type="button"
            onClick={onUseEmail}
            className="justify-self-start text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)] underline decoration-1 underline-offset-4 hover:text-[var(--text-link-hover)]"
          >
            {t("register.account.useEmailInstead")}
          </button>
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={onGoogle}
            className="gt-google-btn flex h-[52px] w-full items-center justify-center gap-3 rounded-[var(--radius-control)] border border-[var(--border-default)] bg-white px-5 text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)] shadow-[var(--shadow-xs)] transition-[border-color,box-shadow,background-color] duration-[var(--duration-fast)] hover:border-[var(--gt-ink-400)] hover:shadow-[var(--shadow-sm)] active:scale-[0.99]"
          >
            <GoogleMark size={19} />
            {t("register.google.cta")}
          </button>

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
            loading={checkingEmail}
            loadingLabel={t("register.checkingEmail")}
            success={emailValid && touched("email") && !checkingEmail}
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
      )}
    </div>
  );
}
