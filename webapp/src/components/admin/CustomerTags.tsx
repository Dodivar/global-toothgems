import { useTranslation } from "react-i18next";
import { Plus, Tag as TagIcon, X } from "lucide-react";
import { Menu } from "../ui/Menu";
import { TAG_ICON } from "./CustomerBadges";
import { CUSTOMER_TAGS, type CustomerTag } from "../../data/adminCustomers";

/**
 * The tag editor.
 *
 * Tags are the administrator's own shorthand, so they are rendered in one quiet
 * neutral tone rather than seven colours: seven coloured pills beside a name
 * would outshout the name, and the meaning of "VIP" is in the word, not in
 * whether it happens to be pink. Each tag carries an icon as a second channel,
 * which is what keeps them separable at a glance without relying on colour
 * (WCAG 2.2 1.4.1) — and "Needs follow-up" is the single exception that takes a
 * tone, because it is the one tag that asks for an action.
 *
 * Removing is an X on the tag itself rather than a mode: with at most seven
 * tags there is nothing to manage, and a "manage tags" dialog would be a screen
 * in front of a one-click operation.
 */
export function CustomerTags({
  tags,
  onAdd,
  onRemove,
  /** Read-only rendering, for the profile header inside the edit form. */
  editable = true,
}: {
  tags: CustomerTag[];
  onAdd: (tag: CustomerTag) => void;
  onRemove: (tag: CustomerTag) => void;
  editable?: boolean;
}) {
  const { t } = useTranslation();
  const available = CUSTOMER_TAGS.filter((tag) => !tags.includes(tag));

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.length === 0 && (
        <span className="text-[length:var(--text-caption)] text-[var(--text-subtle)]">
          {t("admin.customers.tagsEmpty")}
        </span>
      )}

      <ul className="m-0 flex list-none flex-wrap items-center gap-1.5 p-0">
        {tags.map((tag) => {
          const Icon = TAG_ICON[tag];
          const followUp = tag === "followUp";
          return (
            <li
              key={tag}
              className={`motion-safe:animate-[gt-menu-in_var(--duration-fast)_var(--ease-out-soft)_both] inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] border py-1 pl-2.5 text-[length:var(--text-caption)] font-semibold uppercase tracking-[var(--tracking-wide)] ${
                followUp
                  ? "border-[var(--gt-amber-400)] bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)]"
                  : "border-[var(--border-subtle)] bg-[var(--gt-ink-100)] text-[var(--text-body)]"
              } ${editable ? "pr-1" : "pr-2.5"}`}
            >
              <Icon size={12} aria-hidden="true" className="flex-none" />
              {t(`admin.customers.tag.${tag}`)}
              {editable && (
                <button
                  type="button"
                  onClick={() => onRemove(tag)}
                  aria-label={t("admin.customers.tagRemove", { tag: t(`admin.customers.tag.${tag}`) })}
                  className="grid h-[18px] w-[18px] place-items-center rounded-full text-current transition-colors hover:bg-black/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--focus-ring)]"
                >
                  <X size={11} aria-hidden="true" />
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {editable && available.length > 0 && (
        <Menu
          label={t("admin.customers.tagAdd")}
          width={224}
          align="start"
          items={available.map((tag) => ({
            id: tag,
            label: t(`admin.customers.tag.${tag}`),
            icon: TAG_ICON[tag],
            onSelect: () => onAdd(tag),
          }))}
          trigger={(props) => (
            <button
              type="button"
              {...props}
              className="inline-flex items-center gap-1 rounded-[var(--radius-pill)] border border-dashed border-[var(--border-default)] px-2.5 py-1 text-[length:var(--text-caption)] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)] transition-colors hover:border-[var(--gt-ink-400)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
            >
              <Plus size={12} aria-hidden="true" />
              {t("admin.customers.tagAdd")}
            </button>
          )}
        />
      )}

      {editable && available.length === 0 && tags.length > 0 && (
        <span className="inline-flex items-center gap-1 text-[length:var(--text-caption)] text-[var(--text-subtle)]">
          <TagIcon size={12} aria-hidden="true" />
          {t("admin.customers.tagsAll")}
        </span>
      )}
    </div>
  );
}
