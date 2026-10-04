import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { BookOpen, FileText, Search, X } from "lucide-react";
import { Link, useNavigate } from "../../lib/navigation";
import { useCatalog } from "../../lib/catalog/CatalogProvider";
import { useAcademy } from "../../lib/academy/AcademyProvider";
import {
  isEmptyResults,
  MIN_QUERY_LENGTH,
  normalizeQuery,
  searchCourses,
  searchPages,
  searchProducts,
  type SearchHit,
  type SearchResults,
} from "../../lib/siteSearch";

/** Long enough to skip the intermediate keystrokes of a word, short enough to feel instant. */
const DEBOUNCE_MS = 150;

interface HeaderSearchProps {
  id: string;
  onClose: () => void;
}

/**
 * The header's search bar and its results, opened by the header's search
 * buttons (`Header`). Results come grouped (products, courses, pages) in a
 * panel under the field, as the customer types: there is no results page.
 *
 * WAI-ARIA combobox with a listbox popup: focus stays in the field, the
 * arrow keys move the active option, Enter opens it, Escape closes.
 */
export function HeaderSearch({ id, onClose }: HeaderSearchProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const navigate = useNavigate();
  const { products, taxonomy, status: catalogStatus } = useCatalog();
  const { courses } = useAcademy();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const uid = useId();
  const listboxId = `${uid}-results`;

  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [active, setActive] = useState(-1);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Only the last query searched: a newer keystroke cancels the pending one.
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query), DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query]);

  // Outside clicks close the search; the header's search buttons toggle it themselves.
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Element;
      if (rootRef.current?.contains(target) || target.closest?.("[data-search-toggle]")) return;
      onClose();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [onClose]);

  const searchable = normalizeQuery(debounced).length >= MIN_QUERY_LENGTH;
  const results = useMemo<SearchResults>(() => {
    if (!searchable) return { products: [], courses: [], pages: [] };
    return {
      products: searchProducts(products, taxonomy, debounced, lang),
      courses: searchCourses(courses, debounced, lang, (course) => t(`academy.categories.${course.category}`)),
      pages: searchPages(debounced, lang),
    };
  }, [searchable, products, taxonomy, courses, debounced, lang, t]);

  const groups = [
    { key: "products", label: t("siteSearch.groupProducts"), hits: results.products },
    { key: "courses", label: t("siteSearch.groupCourses"), hits: results.courses },
    { key: "pages", label: t("siteSearch.groupPages"), hits: results.pages },
  ].filter((group) => group.hits.length > 0);
  const flat = groups.flatMap((group) => group.hits);
  const optionId = (index: number) => `${uid}-option-${index}`;

  // The panel exists only once something is typed; it then always says something.
  const typed = query.trim().length > 0;
  const pending = normalizeQuery(query) !== normalizeQuery(debounced);
  const showList = typed && flat.length > 0;
  const total = flat.length;
  // Typing resets the highlight; this covers a list that got shorter meanwhile.
  const current = active < total ? active : -1;

  let message: string | null = null;
  let noResults = false;
  if (typed && !showList) {
    if (normalizeQuery(query).length < MIN_QUERY_LENGTH) message = t("siteSearch.keepTyping");
    else if (pending) message = null;
    else if (catalogStatus === "loading" && isEmptyResults(results)) message = t("siteSearch.loading");
    else {
      message = t("siteSearch.noResults");
      noResults = true;
    }
  }

  const close = () => {
    setQuery("");
    onClose();
  };
  const open = (hit: SearchHit) => {
    close();
    navigate(hit.to);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" && total > 0) {
      e.preventDefault();
      setActive((current + 1) % total);
    } else if (e.key === "ArrowUp" && total > 0) {
      e.preventDefault();
      setActive(current <= 0 ? total - 1 : current - 1);
    } else if (e.key === "Enter") {
      // Enter is never needed to search; it opens the highlighted (or best) result.
      const hit = flat[current >= 0 ? current : 0];
      if (hit && showList) {
        e.preventDefault();
        open(hit);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      // The header's own Escape handler closes the search too; this returns focus to its button.
      close();
      // The desktop and mobile headers each have a button; only one is displayed.
      const toggles = document.querySelectorAll<HTMLElement>("[data-search-toggle]");
      Array.from(toggles).find((button) => button.offsetParent !== null)?.focus();
    }
  };

  useEffect(() => {
    if (active >= 0) document.getElementById(`${uid}-option-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, uid]);

  let index = -1;
  return (
    <div
      id={id}
      ref={rootRef}
      className="absolute inset-x-0 top-full border-t border-[var(--border-subtle)] bg-[var(--surface-chrome)] shadow-[var(--shadow-lg)]"
    >
      <div role="search" className="mx-auto grid max-w-[var(--max-width-content)] gap-3 px-3 py-3 md:px-[var(--gutter-page-lg)]">
        <div className="relative">
          <label htmlFor={`${uid}-input`} className="sr-only">
            {t("siteSearch.label")}
          </label>
          <Search size={18} aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            ref={inputRef}
            id={`${uid}-input`}
            type="search"
            role="combobox"
            autoComplete="off"
            spellCheck={false}
            aria-autocomplete="list"
            aria-expanded={showList}
            aria-controls={listboxId}
            aria-activedescendant={current >= 0 ? optionId(current) : undefined}
            value={query}
            placeholder={t("siteSearch.placeholder")}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(-1);
            }}
            onKeyDown={onKeyDown}
            className="h-11 w-full rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-card)] pl-11 pr-11 text-base text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-subtle)] focus:border-[var(--focus-ring)] focus-visible:shadow-[var(--shadow-focus)] md:text-sm [&::-webkit-search-cancel-button]:hidden"
          />
          <button
            type="button"
            onClick={() => {
              if (query) {
                setQuery("");
                setActive(-1);
                inputRef.current?.focus();
              } else {
                close();
              }
            }}
            aria-label={query ? t("siteSearch.clear") : t("siteSearch.close")}
            title={query ? t("siteSearch.clear") : t("siteSearch.close")}
            className="absolute right-1.5 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-[var(--radius-pill)] text-[var(--text-muted)] transition-colors hover:bg-[var(--gt-ink-100)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
          >
            <X size={16} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>

        {/* Always in the page, so the listbox the field points to exists. */}
        <div
          id={listboxId}
          role="listbox"
          aria-label={t("siteSearch.label")}
          hidden={!showList}
          className="grid max-h-[min(70vh,560px)] gap-4 overflow-y-auto overscroll-contain pb-1"
        >
          {groups.map((group) => (
            <div key={group.key} role="group" aria-labelledby={`${uid}-${group.key}`} className="grid gap-1">
              <span id={`${uid}-${group.key}`} role="presentation" className="gt-eyebrow px-2">
                {group.label}
              </span>
              {group.hits.map((hit) => {
                index += 1;
                const i = index;
                const selected = i === current;
                return (
                  <Link
                    key={`${hit.kind}-${hit.key}`}
                    id={optionId(i)}
                    to={hit.to}
                    role="option"
                    aria-selected={selected}
                    tabIndex={-1}
                    onClick={close}
                    onMouseMove={() => setActive(i)}
                    className={`flex items-center gap-3 rounded-[var(--radius-card)] border p-2 text-left transition-colors ${
                      selected
                        ? "border-[var(--gt-blue-300)] bg-[var(--surface-brand-wash)]"
                        : "border-transparent hover:bg-[var(--surface-brand-wash)]"
                    }`}
                  >
                    {hit.image ? (
                      <img
                        src={hit.image}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="h-10 w-10 flex-none rounded-[var(--radius-sm)] border border-[var(--gt-blue-200)] object-cover"
                      />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="grid h-10 w-10 flex-none place-items-center rounded-[var(--radius-sm)] border border-[var(--gt-blue-200)] bg-[var(--surface-card)] text-[var(--text-muted)]"
                      >
                        {hit.kind === "course" ? <BookOpen size={16} /> : <FileText size={16} />}
                      </span>
                    )}
                    <span className="grid min-w-0 gap-0.5">
                      <span className="truncate text-sm font-semibold text-[var(--text-primary)]">{hit.title}</span>
                      {hit.detail && <span className="truncate text-xs text-[var(--text-muted)]">{hit.detail}</span>}
                    </span>
                  </Link>
                );
              })}
            </div>
          ))}
        </div>

        {message && (
          <p className="m-0 grid gap-0.5 px-2 pb-1 text-sm text-[var(--text-primary)]">
            {message}
            {noResults && <span className="text-xs text-[var(--text-muted)]">{t("siteSearch.noResultsHint")}</span>}
          </p>
        )}

        <p aria-live="polite" className="sr-only">
          {showList ? t("siteSearch.resultCount", { count: total }) : (message ?? "")}
        </p>
      </div>
    </div>
  );
}
