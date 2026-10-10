"use client";

import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowRight, Check, LockKeyhole } from "lucide-react";
import clsx from "clsx";
import { Link } from "../../lib/navigation";
import { CHANNEL_KEYS, DEFAULT_SERVER, catalogChannel } from "../../lib/communityChat/model";
import { focusRing } from "./primitives";
import { ChannelIcon } from "./channelIcons";

/**
 * The Lounge, seen from outside: an invitation, not an error.
 *
 * Behind the card, the lounge's shape — its real channels and the outline
 * of a conversation (no member's words: a visitor without access reads
 * nothing of the lounge) — softened rather than replaced by a texture, so
 * what is on offer is visible. The preview is `inert` and hidden from assistive
 * technology; the card says the same thing in words. One way in (a
 * training), one way back (the member space), nothing disabled.
 */
export function LockedLounge() {
  const { t } = useTranslation();
  const channels = CHANNEL_KEYS.map((key) => catalogChannel(DEFAULT_SERVER, key));

  return (
    <div className="relative min-h-[calc(100dvh-3.5rem)] overflow-hidden bg-[var(--surface-page)] lg:min-h-[100dvh]">
      <h1 className="sr-only">{t("lounge.title")}</h1>

      {/* The lounge behind the glass. */}
      <div inert aria-hidden="true" className="pointer-events-none absolute inset-0 flex select-none opacity-70 blur-[3px]">
        <div className="hidden w-[248px] flex-none border-r border-[var(--border-subtle)] bg-[var(--surface-chrome)] p-4 md:block">
          <div className="mb-4 h-14 rounded-[var(--radius-md)] bg-white/80" />
          {channels.map((channel) => (
            <div key={channel.id} className="flex items-center gap-2.5 px-2 py-2 text-[14px] text-[var(--text-muted)]">
              <ChannelIcon channelKey={channel.key} size={16} />
              {channel.name}
            </div>
          ))}
        </div>
        <div className="flex-1 bg-white px-6 pt-20">
          {(["bg-[var(--gt-blue-200)]", "bg-[var(--gt-emerald-300)]", "bg-[var(--gt-fuchsia-300)]", "bg-[var(--gt-ink-200)]"] as const).map((tint, index) => (
            <div key={tint} className="mb-6 flex gap-3">
              <span className={clsx("h-10 w-10 flex-none rounded-full", tint)} />
              <div className="grid gap-1.5">
                <span className="h-3 w-28 rounded-full bg-[var(--gt-ink-300)]" />
                <span className={clsx("h-2.5 rounded-full bg-[var(--gt-ink-200)]", index % 2 ? "w-[min(300px,45vw)]" : "w-[min(420px,60vw)]")} />
                <span className="h-2.5 w-[min(240px,40vw)] rounded-full bg-[var(--gt-ink-100)]" />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(244,248,252,.7),rgba(244,248,252,.25)_75%)]" />

      <div className="relative grid min-h-[inherit] place-items-center px-4 py-10">
        <section className="gt-glass-panel grid w-full max-w-[520px] gap-5 rounded-[var(--radius-xl)] p-[clamp(22px,4vw,36px)]">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 flex-none place-items-center rounded-full bg-[var(--surface-inverse)] text-white">
              <LockKeyhole size={20} aria-hidden="true" />
            </span>
            <span className="gt-eyebrow">{t("lounge.locked.eyebrow")}</span>
          </div>

          <div className="grid gap-2">
            <h2 className="m-0 text-[clamp(24px,3.2vw,30px)] font-[var(--weight-black)] leading-tight text-[var(--text-primary)]">{t("lounge.locked.title")}</h2>
            <p className="m-0 text-[15px] leading-relaxed text-[var(--text-body)]">{t("lounge.locked.body")}</p>
          </div>

          <ul className="m-0 grid list-none gap-2.5 p-0">
            {(["languages", "experts", "network"] as const).map((perk) => (
              <li key={perk} className="flex items-start gap-2.5 text-[14px] text-[var(--text-body)]">
                <span className="mt-0.5 grid h-5 w-5 flex-none place-items-center rounded-full bg-[var(--gt-emerald-50)] text-[var(--gt-emerald-600)]">
                  <Check size={13} strokeWidth={2.6} aria-hidden="true" />
                </span>
                {t(`lounge.locked.perks.${perk}`)}
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/academy"
              className={clsx(
                "inline-flex h-11 items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--accent-cta)] px-5 text-[14.5px] font-bold text-[var(--text-on-accent)] transition-colors hover:bg-[var(--accent-cta-hover)]",
                focusRing,
              )}
            >
              {t("lounge.locked.cta")}
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <Link
              to="/compte"
              className={clsx("inline-flex h-11 items-center gap-2 rounded-[var(--radius-pill)] px-3 text-[14px] font-semibold text-[var(--text-body)] hover:bg-white/70", focusRing)}
            >
              <ArrowLeft size={16} aria-hidden="true" />
              {t("lounge.locked.back")}
            </Link>
          </div>
          <p className="m-0 text-[12.5px] text-[var(--text-muted)]">{t("lounge.locked.note")}</p>
        </section>
      </div>
    </div>
  );
}
