import { useId, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { CircleAlert, PenLine } from "lucide-react";
import clsx from "clsx";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { useAuth } from "../../lib/auth";

/**
 * Asked before a certificate can be downloaded or shared: the first and last
 * name to print on it. Saved to the profile (the same fields as the profile
 * page), so every certificate, the account and the next order agree; once both
 * are there the actions that this form replaces come back on their own.
 */
export function CertificateNameForm({ className, tone = "card" }: { className?: string; tone?: "card" | "plain" }) {
  const { t } = useTranslation();
  const { profile, updateProfile } = useAuth();
  const uid = useId();
  const [firstName, setFirstName] = useState(profile?.firstName ?? "");
  const [lastName, setLastName] = useState(profile?.lastName ?? "");
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const [touched, setTouched] = useState(false);
  const missing = !firstName.trim() || !lastName.trim();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (missing || state === "saving") return;
    setState("saving");
    const ok = await updateProfile({ firstName: firstName.trim(), lastName: lastName.trim() });
    setState(ok ? "idle" : "error");
  };

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-labelledby={`${uid}-title`}
      className={clsx(
        "grid gap-4 text-left",
        tone === "card" && "rounded-[var(--radius-card)] border border-[var(--gt-blue-200)] bg-[var(--gt-blue-50)] p-[clamp(16px,3vw,24px)]",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-[var(--surface-card)] text-[var(--gt-blue-700)] shadow-[var(--shadow-xs)]">
          <PenLine size={18} aria-hidden="true" />
        </span>
        <div className="grid gap-1">
          <h3 id={`${uid}-title`} className="text-[length:var(--text-body-md)] font-bold">
            {t("certificate.nameTitle")}
          </h3>
          <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("certificate.nameBody")}</p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          id={`${uid}-first`}
          label={t("certificate.nameFirst")}
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          autoComplete="given-name"
          required
          aria-invalid={touched && !firstName.trim()}
          maxLength={80}
        />
        <Input
          id={`${uid}-last`}
          label={t("certificate.nameLast")}
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          autoComplete="family-name"
          required
          aria-invalid={touched && !lastName.trim()}
          maxLength={80}
        />
      </div>
      <p role="status" aria-live="polite" className={touched && missing ? "m-0 flex items-center gap-2 text-[length:var(--text-caption)] text-[var(--status-error-fg)]" : "sr-only"}>
        {touched && missing && <CircleAlert size={14} aria-hidden="true" />}
        {touched && missing ? t("certificate.nameMissing") : ""}
      </p>
      {state === "error" && (
        <p role="alert" className="m-0 flex items-center gap-2 text-[length:var(--text-caption)] text-[var(--status-error-fg)]">
          <CircleAlert size={14} aria-hidden="true" />
          {t("certificate.nameError")}
        </p>
      )}
      <div>
        <Button type="submit" variant="dark" loading={state === "saving"}>
          {t("certificate.nameSave")}
        </Button>
      </div>
    </form>
  );
}
