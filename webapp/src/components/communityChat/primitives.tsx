"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { X, type LucideIcon } from "lucide-react";
import clsx from "clsx";
import type { AvatarTone, ChatMember, ChatRole, Presence } from "../../lib/communityChat/model";

/*
 * Small pieces shared by every part of the Members' Lounge. The lounge reuses
 * initials on a tint (`TONE_SOLID`).
 */

/** Filled avatar treatment. Every pairing here clears AA at avatar sizes. */
const TONE_SOLID: Record<AvatarTone, string> = {
  blue: "bg-[var(--gt-blue-300)] text-[var(--gt-ink-900)]",
  emerald: "bg-[var(--gt-emerald-300)] text-[var(--gt-ink-900)]",
  fuchsia: "bg-[var(--gt-fuchsia-300)] text-[var(--gt-ink-900)]",
  ink: "bg-[var(--surface-inverse)] text-[var(--text-inverse)]",
};

function initialsOf(name: string): string {
  const parts = name.split(" ").filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0].charAt(0) + (parts.length > 1 ? parts[parts.length - 1].charAt(0) : "")).toUpperCase();
}

export const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]";

/* ----------------------------------------------------------------- avatar */

const AVATAR_SIZES = {
  xs: "h-6 w-6 text-[9px]",
  sm: "h-8 w-8 text-[11px]",
  md: "h-10 w-10 text-[13px]",
  lg: "h-20 w-20 text-[24px]",
} as const;

const DOT_SIZES = { xs: "h-2.5 w-2.5", sm: "h-3 w-3", md: "h-3.5 w-3.5", lg: "h-5 w-5" } as const;

/**
 * Presence as a shape as well as a colour: a filled green disc when online,
 * a crescent-like half disc when away, a hollow ring when offline — so the
 * three states stay distinct without colour vision.
 */
export function PresenceDot({ presence, size = "sm", className }: { presence: Presence; size?: keyof typeof DOT_SIZES; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={clsx(
        "block rounded-full border-2 border-[var(--surface-card)]",
        DOT_SIZES[size],
        presence === "online" && "bg-[var(--gt-emerald-500)]",
        presence === "away" && "bg-[linear-gradient(90deg,var(--gt-blue-500)_50%,var(--gt-blue-100)_50%)]",
        presence === "offline" && "bg-[var(--surface-card)] shadow-[inset_0_0_0_2px_var(--gt-ink-400)]",
        className,
      )}
    />
  );
}

export function ChatAvatar({
  member,
  size = "md",
  presence = false,
  className,
}: {
  member: Pick<ChatMember, "name" | "tone" | "presence">;
  size?: keyof typeof AVATAR_SIZES;
  /** Shows the presence marker, with its state for screen readers. */
  presence?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <span className={clsx("relative inline-flex flex-none", className)}>
      <span
        aria-hidden="true"
        className={clsx("grid place-items-center rounded-full font-[var(--weight-black)] leading-none", AVATAR_SIZES[size], TONE_SOLID[member.tone])}
      >
        {initialsOf(member.name)}
      </span>
      {presence && (
        <>
          <PresenceDot presence={member.presence} size={size === "lg" ? "lg" : size === "xs" ? "xs" : "sm"} className="absolute -bottom-0.5 -right-0.5" />
          <span className="sr-only">{t(`lounge.presence.${member.presence}`)}</span>
        </>
      )}
    </span>
  );
}

/* ------------------------------------------------------------------ badges */

/** A role beside a name: written out, the tint only reinforces it. */
export function RoleBadge({ role, className }: { role: ChatRole; className?: string }) {
  const { t } = useTranslation();
  return (
    <span
      title={t(`lounge.roles.${role}Long`)}
      className={clsx(
        "inline-flex items-center rounded-[var(--radius-xs)] px-1.5 py-px text-[10px] font-bold uppercase leading-[16px] tracking-[0.04em]",
        role === "team" && "bg-[var(--surface-inverse)] text-[var(--text-inverse)]",
        role === "mentor" && "bg-[var(--gt-emerald-50)] text-[var(--gt-emerald-600)]",
        role === "new" && "bg-[var(--gt-blue-100)] text-[var(--gt-blue-700)]",
        className,
      )}
    >
      {t(`lounge.roles.${role}`)}
    </span>
  );
}

/**
 * Unread count. `tone="mention"` is the stronger fuchsia pill used for
 * mentions; the number is always written, so the state is not colour only.
 */
export function CountBadge({ count, tone = "default", label }: { count: number; tone?: "default" | "mention" | "accent" | "muted"; label?: string }) {
  if (count <= 0) return null;
  return (
    <span
      className={clsx(
        "inline-flex h-[18px] min-w-[18px] flex-none items-center justify-center rounded-[var(--radius-pill)] px-1.5 text-[10.5px] font-bold leading-none",
        (tone === "mention" || tone === "accent") && "bg-[var(--accent-highlight-ink)] text-white",
        tone === "default" && "bg-[var(--surface-inverse)] text-[var(--text-inverse)]",
        tone === "muted" && "bg-[var(--gt-ink-200)] text-[var(--text-body)]",
      )}
    >
      <span aria-hidden={label ? true : undefined}>{tone === "mention" ? `@${count}` : count > 99 ? "99+" : count}</span>
      {label && <span className="sr-only">{label}</span>}
    </span>
  );
}

/* ------------------------------------------------------------- icon button */

export function ToolButton({
  icon: Icon,
  label,
  onClick,
  pressed,
  expanded,
  badge,
  className,
  size = 36,
  disabled,
  ...rest
}: {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  pressed?: boolean;
  expanded?: boolean;
  badge?: ReactNode;
  className?: string;
  size?: number;
  disabled?: boolean;
} & Record<`aria-${string}` | `data-${string}`, string | boolean | undefined>) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      aria-expanded={expanded}
      onClick={onClick}
      disabled={disabled}
      style={{ width: size, height: size }}
      className={clsx(
        "relative inline-grid flex-none place-items-center rounded-[var(--radius-sm)] text-[var(--text-body)] transition-colors duration-[var(--duration-fast)]",
        "hover:bg-[var(--gt-ink-100)] hover:text-[var(--text-primary)] active:scale-[0.96] disabled:pointer-events-none disabled:opacity-40",
        pressed && "bg-[var(--surface-brand-wash-strong)] text-[var(--text-primary)]",
        focusRing,
        className,
      )}
      {...rest}
    >
      <Icon size={Math.round(size * 0.5)} strokeWidth={1.9} aria-hidden="true" />
      {badge}
    </button>
  );
}

/* ----------------------------------------------------------------- popover */

/**
 * A light, non-modal panel anchored to its trigger: server switcher, reaction
 * picker, message actions, status menu. Escape and a click outside close it
 * and give the keyboard back to the trigger.
 */
export function Popover({
  trigger,
  children,
  align = "start",
  side = "bottom",
  width,
  label,
  className,
  role = "dialog",
}: {
  trigger: (props: {
    ref: (node: HTMLButtonElement | null) => void;
    onClick: () => void;
    "aria-expanded": boolean;
    "aria-haspopup": "dialog" | "menu" | "listbox";
    "aria-controls": string;
  }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "start" | "end";
  side?: "top" | "bottom";
  width?: number | string;
  label: string;
  className?: string;
  role?: "dialog" | "menu" | "listbox";
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const id = useId();

  const setTriggerRef = useCallback((node: HTMLButtonElement | null) => {
    triggerRef.current = node;
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const first = panelRef.current?.querySelector<HTMLElement>("button:not([disabled]), [href], input");
    first?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close();
        return;
      }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const items = Array.from(panelRef.current?.querySelectorAll<HTMLElement>("[data-popover-item]") ?? []);
      if (items.length === 0 || !items.includes(document.activeElement as HTMLElement)) return;
      event.preventDefault();
      const index = items.indexOf(document.activeElement as HTMLElement);
      const forward = event.key === "ArrowDown" || event.key === "ArrowRight";
      items[(index + (forward ? 1 : -1) + items.length) % items.length]?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open, close]);

  return (
    <div ref={wrap} className="relative inline-flex">
      {trigger({
        ref: setTriggerRef,
        onClick: () => setOpen((value) => !value),
        "aria-expanded": open,
        "aria-haspopup": role,
        "aria-controls": id,
      })}
      {open && (
        <div
          ref={panelRef}
          id={id}
          role={role}
          aria-label={label}
          style={{ width }}
          className={clsx(
            "absolute z-[60] rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,.97)] p-1.5 shadow-[var(--shadow-lg)] backdrop-blur-[var(--glass-blur)]",
            "motion-safe:animate-[gt-menu-in_var(--duration-fast)_var(--ease-out-soft)_both]",
            side === "bottom" ? "top-[calc(100%+6px)] origin-top" : "bottom-[calc(100%+6px)] origin-bottom",
            align === "start" ? "left-0" : "right-0",
            className,
          )}
        >
          {children(close)}
        </div>
      )}
    </div>
  );
}

/** One row of a popover menu; arrow keys move between rows. */
export function PopoverItem({
  icon: Icon,
  children,
  onSelect,
  current,
  trailing,
}: {
  icon?: LucideIcon;
  children: ReactNode;
  onSelect: () => void;
  current?: boolean;
  trailing?: ReactNode;
}) {
  return (
    <button
      type="button"
      data-popover-item
      aria-current={current ? "true" : undefined}
      onClick={onSelect}
      className={clsx(
        "flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-left text-[length:var(--text-body-sm)] text-[var(--text-body)] transition-colors",
        "hover:bg-[var(--gt-ink-100)] hover:text-[var(--text-primary)] focus-visible:bg-[var(--gt-ink-100)] focus-visible:outline-none",
        current && "font-semibold text-[var(--text-primary)]",
      )}
    >
      {Icon && <Icon size={15} strokeWidth={2} aria-hidden="true" className="flex-none" />}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {trailing}
    </button>
  );
}

/* ------------------------------------------------------------------ dialog */

/**
 * The lounge's modal: the native `<dialog>` with `showModal()`, for its
 * focus trap, Escape, inert background and backdrop — the same mechanics as
 * the forum's `CommunityDialog`, with a placement option (search and inbox
 * open near the top, like a command palette) and a lighter glass panel.
 * Mounted only while open.
 */
export function ChatDialog({
  titleId,
  onClose,
  children,
  width = "520px",
  placement = "center",
  hideClose = false,
  className,
}: {
  titleId: string;
  onClose: () => void;
  children: ReactNode;
  width?: string;
  placement?: "center" | "top";
  hideClose?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const handleClose = () => closeRef.current();
    dialog.addEventListener("close", handleClose);
    const opener = document.activeElement;
    if (!dialog.open) dialog.showModal();
    /* React keeps `autoFocus` to itself, so the dialog would land on its close
       button: a field marked `data-autofocus` takes the keyboard instead. */
    dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    return () => {
      dialog.removeEventListener("close", handleClose);
      if (opener instanceof HTMLElement && document.contains(opener)) opener.focus();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClick={(event) => {
        if (event.target === ref.current) ref.current?.close();
      }}
      className={clsx(
        "overflow-visible border-0 bg-transparent p-0",
        placement === "center" ? "m-auto" : "mx-auto mb-auto mt-[min(12vh,96px)]",
        "backdrop:bg-[rgba(17,17,17,.42)] backdrop:backdrop-blur-[2px]",
      )}
      style={{ width: `min(${width}, calc(100vw - 24px))` }}
    >
      <div
        className={clsx(
          "relative flex max-h-[calc(100dvh-32px)] flex-col overflow-hidden rounded-[var(--radius-lg)] border border-white/70 bg-[rgba(255,255,255,.94)] text-[var(--text-body)] shadow-[var(--shadow-glass-heavy)] backdrop-blur-[var(--glass-blur)]",
          "motion-safe:animate-[gt-menu-in_var(--duration-normal)_var(--ease-out-soft)_both]",
          className,
        )}
      >
        {!hideClose && (
          <span className="absolute right-3 top-3 z-[1]">
            <ToolButton icon={X} label={t("common.close")} onClick={() => ref.current?.close()} size={32} />
          </span>
        )}
        {children}
      </div>
    </dialog>
  );
}

/* -------------------------------------------------------------------- time */

/** The current time, refreshed every minute; `minutesAgo` fixtures are read against it. */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

export function useChatTime() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith("fr") ? "fr-FR" : "en-GB";

  const clock = useCallback(
    (timestamp: number) => new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(timestamp),
    [locale],
  );

  /** "Today" / "Yesterday" / "Monday 5 October". */
  const day = useCallback(
    (timestamp: number, now: number) => {
      const startOf = (value: number) => {
        const date = new Date(value);
        date.setHours(0, 0, 0, 0);
        return date.getTime();
      };
      const diff = Math.round((startOf(now) - startOf(timestamp)) / 86_400_000);
      if (diff === 0) return t("lounge.message.today");
      if (diff === 1) return t("lounge.message.yesterday");
      return new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" }).format(timestamp);
    },
    [locale, t],
  );

  /** Compact, for lists: "10:42" today, "Yesterday", "Mon" this week, "5 Oct" before. */
  const short = useCallback(
    (timestamp: number, now: number) => {
      const days = (now - timestamp) / 86_400_000;
      if (new Date(timestamp).toDateString() === new Date(now).toDateString()) return clock(timestamp);
      if (days < 2) return t("lounge.message.yesterday");
      if (days < 7) return new Intl.DateTimeFormat(locale, { weekday: "short" }).format(timestamp);
      return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(timestamp);
    },
    [clock, locale, t],
  );

  const monthYear = useCallback(
    (yearMonth: string) => new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(new Date(`${yearMonth}-01T12:00:00`)),
    [locale],
  );

  return { clock, day, short, monthYear, locale };
}

/** Country name in the interface language, from its ISO code. */
export function useCountryName() {
  const { i18n } = useTranslation();
  return useCallback(
    (code: string) => {
      if (!code) return "";
      try {
        return new Intl.DisplayNames([i18n.language || "en"], { type: "region" }).of(code) ?? code;
      } catch {
        return code;
      }
    },
    [i18n.language],
  );
}

/** Flag emoji of an ISO country code (regional indicator letters). */
export function flagOf(code: string): string {
  if (!/^[A-Z]{2}$/.test(code)) return "";
  return String.fromCodePoint(...[...code].map((letter) => 0x1f1e6 + letter.charCodeAt(0) - 65));
}
