# Internationalization & International SEO

## Languages

The initial storefront target languages are:
- French;
- English;
- German.

The architecture must make additional locales possible without redesigning the application.

## Application localization

Use a mature i18n system such as next-intl. Customer-facing UI strings must not be hard-coded throughout components or business logic.

Locale-aware URLs should be considered from the start, for example:
- `/fr/...`
- `/en/...`
- `/de/...`

## Content localization

Product and course content must be modeled independently from UI translations. Use translation tables/entities keyed by locale for scalable content.

## Commerce localization

Treat these as separate dimensions:
- language;
- country;
- currency;
- tax regime/jurisdiction;
- shipping zone.

Do not assume that selecting a language determines currency or tax treatment.

## SEO

International SEO should support:
- localized metadata;
- canonical URLs;
- hreflang relationships;
- locale-aware structured data where appropriate;
- crawlable localized product and course pages;
- correct handling of unavailable translations.

Avoid duplicate-content problems caused by inconsistent locale URLs.

## Translation workflow

Customer-facing translations should be explicit and reviewable. Do not silently machine-translate sensitive commercial, legal or instructional content without a defined review process.
