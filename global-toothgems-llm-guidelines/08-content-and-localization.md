---
name: global-toothgems-content-localization
description: UI localization with react-i18next, content translations in the database, copywriting tone, SEO for the SPA, user-generated content.
---

# Content, Localization & SEO

## Languages

- Launch: **French** (default, reference, base columns) and **English**.
- German: enabled in the `languages` table, planned, not launch-blocking. Do not add partial `de` UI files; adding German is a deliberate project step (UI JSON + content translations + review).
- Adding a locale must not require redesign: locale lists come from configuration/`languages`, not scattered conditionals.

## UI strings (react-i18next)

- All customer-facing and staff-facing text in `webapp/src/i18n/locales/` (`fr.json`, `en.json`, and namespaced files such as `promotions.*`, `reviews.*`, `settings.*`, `studio.*`). Every key in both languages.
- Complete sentences with interpolation; never concatenate translated fragments. Pluralization via i18next plurals.
- Dates, numbers and currencies with `Intl` in the active locale (`lib/format.ts`).
- Error messages from Supabase or Edge Functions are mapped to translation keys, never shown raw.

## Content translations (database)

- Products, variants, media alt text, categories, gem colours, promotions, campaigns, e-mail templates and content pages: base columns in French, other locales in `*_translations` rows with `draft`/`published` status; only published rows are public; fallback to French.
- Future Academy content follows the same model. Never add `name_en`-style columns.
- `translation_status` reports missing/outdated translations for the back office.

## Commerce localization

Language, country, currency, tax regime and shipping zone are independent. Selecting English does not change currency, VAT or shipping.

## Translation workflow

Translations are explicit and reviewable. Do not silently machine-translate commercial, legal or instructional content; if you draft a translation, mark it as a draft for review.

## Tone

Professional, friendly, confident, reassuring, premium, concise. Avoid jargon, aggressive sales language, childish wording, unsupported claims, and medical/technical claims that have not been validated. Product descriptions separate specifications, usage instructions, recommendations and marketing copy. Never invent product properties, legal terms or company identifiers — use a visible placeholder and flag it.

## Training content

Clear, structured, encouraging, actionable. Incorrect quiz answers teach rather than shame.

## User-generated content

Reviews, community posts and Studio creation names are the author's words: never translated, altered or re-attributed without an explicit product decision.

## SEO (SPA)

The webapp is a client-rendered SPA; public pages (home, shop, product, course sales pages, legal, help) must still be indexable and shareable:

- meaningful `<title>` and meta description per route, localized; canonical URL; Open Graph tags for product and course pages;
- semantic headings, crawlable links (`<a href>` via router links, not click handlers), clean stable URLs (French paths today; product slugs per locale exist in `product_translations`);
- structured data (Product, Course) where appropriate;
- correct 404 for unknown slugs.

Open decision before launch (ask the user, do not improvise): locale URL strategy (`/en/...` prefixes vs. current toggle), hreflang, and prerendering/SSG of public pages for crawlers and social previews. Do not introduce a new framework for this without that decision.
