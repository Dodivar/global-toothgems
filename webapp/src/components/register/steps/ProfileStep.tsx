import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { SelectField, TextField } from "../Field";
import { StepHeading } from "./StepHeading";
import { REGISTRATION_COUNTRIES, countryName, dialCodeOf, validateField } from "../../../lib/registration";
import type { StepProps } from "./types";

/**
 * Step 2 — who the account belongs to.
 *
 * The phone is optional and says so in the label, not only in a hint. Its
 * example follows the selected country's dialling code, which is what makes
 * "include your country code" actionable rather than a riddle.
 */
export function ProfileStep({ data, errors, set, blur, fieldRef, headingRef }: StepProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.slice(0, 2);

  const countries = useMemo(
    () =>
      REGISTRATION_COUNTRIES.map((c) => ({ value: c.code, label: countryName(c.code, lang) })).sort((a, b) =>
        a.label.localeCompare(b.label, lang),
      ),
    [lang],
  );

  const dial = dialCodeOf(data.country) ?? "+33";
  const phoneFilled = data.phone.trim().length > 0;

  return (
    <div className="grid gap-5">
      <StepHeading headingRef={headingRef} title={t("register.profile.title")} body={t("register.profile.body")} />

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-4">
        <TextField
          ref={fieldRef("firstName")}
          id="reg-first-name"
          label={t("register.fields.firstName")}
          autoComplete="given-name"
          value={data.firstName}
          onChange={(e) => set("firstName", e.target.value)}
          onBlur={() => blur("firstName")}
          error={errors.firstName}
        />
        <TextField
          ref={fieldRef("lastName")}
          id="reg-last-name"
          label={t("register.fields.lastName")}
          autoComplete="family-name"
          value={data.lastName}
          onChange={(e) => set("lastName", e.target.value)}
          onBlur={() => blur("lastName")}
          error={errors.lastName}
        />
      </div>

      <SelectField
        ref={fieldRef("country")}
        id="reg-country"
        label={t("register.fields.country")}
        autoComplete="country"
        placeholder={t("register.fields.countryPlaceholder")}
        options={countries}
        value={data.country}
        onChange={(e) => set("country", e.target.value)}
        onBlur={() => blur("country")}
        error={errors.country}
        hint={t("register.fields.countryHint")}
      />

      <TextField
        ref={fieldRef("phone")}
        id="reg-phone"
        label={t("register.fields.phone")}
        optional
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder={t("register.fields.phonePlaceholder", { dial })}
        value={data.phone}
        onChange={(e) => set("phone", e.target.value)}
        onBlur={() => blur("phone")}
        error={errors.phone}
        success={phoneFilled && !validateField("phone", data)}
        hint={t("register.fields.phoneHint", { dial })}
      />
    </div>
  );
}
