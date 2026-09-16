import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Check, LogOut, UserRound } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Checkbox } from "../../components/ui/Checkbox";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Panel, SectionHeader } from "../../components/account/SectionHeader";
import { DELIVERY_COUNTRIES, countryLabelKey } from "../../data/countries";
import { useAuth, type Profile as MemberProfile } from "../../lib/auth";
import { useToast } from "../../lib/toast";

/**
 * Profile details, viewed and edited in place.
 *
 * The form keeps a draft and only writes it back to the session on submit, so
 * the greeting and the avatar change once — when the member saves — rather than
 * on every keystroke. Nothing is persisted: like the rest of this prototype the
 * session lives in memory, which the note under the form states plainly.
 */

export function Profile() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { profile, updateProfile, signOut } = useAuth();
  const { showToast } = useToast();

  // `RequireAccount` guards the route, so a signed-out visitor never gets here.
  const [draft, setDraft] = useState<MemberProfile>(profile!);

  const dirty = JSON.stringify(draft) !== JSON.stringify(profile);
  const set = <K extends keyof MemberProfile>(key: K) => (value: MemberProfile[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const setText = (key: keyof MemberProfile) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDraft((d) => ({ ...d, [key]: e.target.value }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    updateProfile(draft);
    showToast(t("account.toastProfileTitle"), t("account.toastProfileBody"));
  };

  return (
    <form onSubmit={submit} className="grid gap-5">
      <SectionHeader
        icon={UserRound}
        eyebrow={t("account.profileEyebrow")}
        title={t("account.profileTitle")}
        description={t("account.profileBody")}
      />

      <Panel title={t("account.profileIdentityTitle")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            id="profile-first-name"
            label={t("auth.firstName")}
            value={draft.firstName}
            autoComplete="given-name"
            onChange={setText("firstName")}
          />
          <Input
            id="profile-last-name"
            label={t("auth.lastName")}
            value={draft.lastName}
            autoComplete="family-name"
            onChange={setText("lastName")}
          />
          <Input
            id="profile-email"
            type="email"
            label={t("auth.email")}
            value={draft.email}
            autoComplete="email"
            required
            onChange={setText("email")}
          />
          <Input
            id="profile-phone"
            type="tel"
            label={t("account.profilePhone")}
            value={draft.phone}
            autoComplete="tel"
            onChange={setText("phone")}
          />
        </div>
      </Panel>

      <Panel title={t("account.profileAddressTitle")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Input
              id="profile-address"
              label={t("account.profileAddress")}
              value={draft.addressLine}
              autoComplete="address-line1"
              onChange={setText("addressLine")}
            />
          </div>
          <Input
            id="profile-postal-code"
            label={t("account.profilePostalCode")}
            value={draft.postalCode}
            autoComplete="postal-code"
            inputMode="numeric"
            onChange={setText("postalCode")}
          />
          <Input
            id="profile-city"
            label={t("account.profileCity")}
            value={draft.city}
            autoComplete="address-level2"
            onChange={setText("city")}
          />
          <Select
            label={t("account.profileCountry")}
            options={DELIVERY_COUNTRIES.map((code) => ({ value: code, label: t(countryLabelKey(code)) }))}
            value={draft.country}
            onChange={set("country")}
          />
        </div>
        <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">
          {t("account.profileAddressNote")}
        </p>
      </Panel>

      <Panel title={t("account.profilePrefsTitle")}>
        <Checkbox
          label={t("auth.newsletter")}
          description={t("auth.newsletterDescription")}
          checked={draft.newsletter}
          onChange={set("newsletter")}
        />
      </Panel>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" iconLeft={Check} disabled={!dirty}>
          {t("account.profileSave")}
        </Button>
        <Button type="button" variant="ghost" disabled={!dirty} onClick={() => setDraft(profile!)}>
          {t("account.profileCancel")}
        </Button>
        <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("account.detailsNote")}</span>
      </div>

      <Panel title={t("account.profileSecurityTitle")}>
        <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
          {t("account.profileSecurityBody")}
        </p>
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            iconLeft={LogOut}
            onClick={() => {
              signOut();
              navigate("/");
            }}
          >
            {t("auth.signOut")}
          </Button>
        </div>
      </Panel>
    </form>
  );
}
