import { Fragment, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CircleDashed, TriangleAlert } from "lucide-react";
import clsx from "clsx";

/**
 * Renders the small inline markup used by the legal content (see
 * `data/legal/types.ts`). Deliberately tiny: four tokens, no nesting, so a
 * legal reviewer can read the source strings without learning a syntax.
 */

const TOKEN = /\[\[(!?)(.+?)\]\]|<<(.+?)\|(.+?)>>|\*\*(.+?)\*\*/g;

export function Placeholder({ label, business = false }: { label: string; business?: boolean }) {
  const { t } = useTranslation();
  const Icon = business ? TriangleAlert : CircleDashed;
  return (
    <span className={clsx("gt-placeholder", business && "gt-placeholder--business")}>
      <span className="gt-placeholder__kind">
        <Icon size={12} strokeWidth={2.4} aria-hidden="true" />
        {t(business ? "legal.placeholder.business" : "legal.placeholder.verify")}
        <span className="sr-only">:</span>
      </span>
      <span>{label}</span>
    </span>
  );
}

export function RichText({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    if (match.index > last) out.push(text.slice(last, match.index));
    const key = match.index;
    if (match[2] !== undefined) {
      out.push(<Placeholder key={key} label={match[2]} business={match[1] === "!"} />);
    } else if (match[3] !== undefined) {
      out.push(
        <Link key={key} to={match[4]} className="gt-legal-link">
          {match[3]}
        </Link>,
      );
    } else {
      out.push(
        <strong key={key} className="font-semibold text-[var(--text-primary)]">
          {match[5]}
        </strong>,
      );
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <Fragment>{out}</Fragment>;
}
