"use client";

import { useTranslation } from "react-i18next";
import { ArrowRight, Check, LockKeyhole } from "lucide-react";
import clsx from "clsx";
import { Dialog } from "../ui/Dialog";
import { Link } from "../../lib/navigation";
import { GLOWBOOK_INTRO_PATH, STUDIO_SUBSCRIBE_PATH } from "../../lib/studioUrl";

/**
 * Why a member-space entry is locked, and what opens it — shown when a locked
 * entry of the menu is clicked, instead of a subtitle on every locked row
 * (owner's request, 2026-11-15). The menu only shows a lock; the reason and
 * the benefits come when the member shows interest.
 *
 * Display only: the locked pages themselves (`/compte/salons`, the Glowbook,
 * `/compte/agenda`) still say the same on a direct visit, and the database
 * decides access.
 */

export type LockedAccessKind = "lounge" | "atelier";

interface LockedCopy {
  eyebrow: string;
  title: string;
  body: string;
  perks: string[];
  cta: { to: string; label: string };
  secondary?: { to: string; label: string };
  note: string;
}

const ctaClass =
  "inline-flex h-11 items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--accent-cta)] px-5 text-[14.5px] font-bold text-[var(--text-on-accent)] transition-colors hover:bg-[var(--accent-cta-hover)]";
const secondaryClass =
  "inline-flex h-11 items-center gap-2 rounded-[var(--radius-pill)] px-3 text-[14px] font-semibold text-[var(--text-body)] hover:bg-[var(--gt-ink-100)]";
const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]";

function useLockedCopy(kind: LockedAccessKind): LockedCopy {
  const { t } = useTranslation();
  if (kind === "lounge") {
    return {
      eyebrow: t("lounge.locked.eyebrow"),
      title: t("lounge.locked.title"),
      body: t("lounge.locked.body"),
      perks: (["languages", "experts"] as const).map((perk) => t(`lounge.locked.perks.${perk}`)),
      cta: { to: "/academy", label: t("lounge.locked.cta") },
      note: t("lounge.locked.note"),
    };
  }
  return {
    eyebrow: t("account.shell.lockedAtelier.eyebrow"),
    title: t("account.shell.lockedAtelier.title"),
    body: t("account.shell.lockedAtelier.body"),
    perks: (["page", "booking", "agenda", "tryOn"] as const).map((perk) => t(`account.shell.lockedAtelier.perks.${perk}`)),
    cta: { to: STUDIO_SUBSCRIBE_PATH, label: t("account.shell.lockedAtelier.cta") },
    secondary: { to: GLOWBOOK_INTRO_PATH, label: t("account.shell.lockedAtelier.secondary") },
    note: t("account.shell.lockedAtelier.note"),
  };
}

export function LockedAccessDialog({ kind, onClose }: { kind: LockedAccessKind | null; onClose: () => void }) {
  const { t } = useTranslation();
  const copy = useLockedCopy(kind ?? "lounge");

  return (
    <Dialog
      open={kind !== null}
      onClose={onClose}
      title={copy.title}
      description={copy.eyebrow}
      icon={<LockKeyhole size={17} />}
      closeLabel={t("common.close")}
      footer={
        <>
          <Link to={copy.cta.to} onClick={onClose} className={clsx(ctaClass, focusRing)}>
            {copy.cta.label}
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
          {copy.secondary && (
            <Link to={copy.secondary.to} onClick={onClose} className={clsx(secondaryClass, focusRing)}>
              {copy.secondary.label}
            </Link>
          )}
        </>
      }
    >
      <p className="m-0 text-[15px] leading-relaxed text-[var(--text-body)]">{copy.body}</p>
      <ul className="m-0 grid list-none gap-2.5 p-0">
        {copy.perks.map((perk) => (
          <li key={perk} className="flex items-start gap-2.5 text-[14px] text-[var(--text-body)]">
            <span className="mt-0.5 grid h-5 w-5 flex-none place-items-center rounded-full bg-[var(--gt-emerald-50)] text-[var(--gt-emerald-600)]">
              <Check size={13} strokeWidth={2.6} aria-hidden="true" />
            </span>
            {perk}
          </li>
        ))}
      </ul>
      <p className="m-0 text-[12.5px] text-[var(--text-muted)]">{copy.note}</p>
    </Dialog>
  );
}
