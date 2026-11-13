# Product feeds (Google Merchant Center, Meta catalogue) and the Meta Pixel

What the site provides, and what the owner sets up in Google and Meta. Decided by the owner on 2026-11-13
(`supabase/README.md`, decision 143). Built on 2026-11-13.

## What the site provides

| Piece | Where | Notes |
| --- | --- | --- |
| French feed | `https://<domain>/feeds/google-fr.xml` | Items link to `/fr/boutique/<slug>` |
| English feed | `https://<domain>/feeds/google-en.xml` | Items link to `/en/shop/<slug>` |
| Product structured data | every product page (`<script type="application/ld+json">`) | `Product` with one `Offer`, or `ProductGroup` with one `Offer` per variant |
| Meta Pixel | storefront pages, only with the "Advertising" cookie consent | `NEXT_PUBLIC_META_PIXEL_ID` on Vercel |

- **One item per variant**, its id = the variant's row id (the product's row id when it has no variants). The same
  id goes in the Pixel's `content_ids`, so Meta can match ads, events and catalogue.
- **Prices = the page's prices.** During an automatic percentage promotion the page shows the database's price now.
  The feed then sends `price` = the Omnibus reference price and `sale_price` = the page price. That happens only when
  `storefront_price_references()` says `reduced` (decision 129), with `sale_price_effective_date` when the promotion
  has an end date. Otherwise the feed sends `price` = the page price and no sale price.
- **Each variant links to its own page state**: `…/<slug>?variant=<id>` opens the product page on that variant
  (price, stock, photo). The canonical address stays the bare one.
- **Constant attributes**: `brand` = Global Toothgems, `identifier_exists` = no (no GTIN/MPN), `condition` = new.
  Also sent: `product_type` (category > family, in the feed's language), `color` (a colour option, else the gem's
  colour), `size` (the other options, else the variant's name), `shipping_weight` when the catalogue has a weight.
- **Left out** (`webapp/src/lib/catalog/productFeed.ts`, constants at the top):
  - courses, gift cards and the 3D Studio (not products in the feed's catalogue);
  - digital products;
  - the category `materiel` (adhesives, composites, etching, lamps… and the tools), and any kit that holds one of
    its products or a component the public cannot read;
  - packs that also open a course or Studio months;
  - preorder variants (Google requires an `availability_date` the catalogue does not hold);
  - items without a photo.
- The feeds are rebuilt from the catalogue on each fetch (cached 60 s, CDN 10 min). A failed catalogue read answers
  503 instead of a half-empty or wrongly priced feed: the platforms keep their last good copy. Mock mode has no feed.
- **German: later.** A `/feeds/google-de.xml` needs the German product translations and `/de/…` pages first. Neither
  exists yet.

## Google Merchant Center: free listings only (owner's steps)

No Google tag and no Google Ads conversion tracking: free listings need neither.

1. **Account**: create a Merchant Center account (merchants.google.com) with the business Google account.
2. **Business info**:
   - business name **Global Toothgems**;
   - address and customer-service e-mail/phone as shown on the site's legal notice and contact page;
   - website URL.
   The legal pages also name PIMP TON SMILE (trading name) and the entrepreneur. If Google asks during review, the
   legal notice explains the link.
3. **Website**: verify and claim the domain.
   - Easiest: through Google Search Console, with a DNS TXT record.
   - Add the record in Vercel › Domains › the domain › DNS records (or at the DNS host, if the domain's DNS is not at
     Vercel).
4. **Shipping** (Merchant Center › Shipping and returns):
   - recreate the zones and rates of the back office (Settings › Shipping): one shipping service per country, rates
     by weight and/or order amount, free shipping above the threshold set there;
   - handling time 1–3 working days;
   - transit times = the min/max days of each rate.
5. **Returns**:
   - 14 days after receipt;
   - return costs paid by the customer;
   - return policy URL = `/fr/retours-remboursements` (and `/en/returns`);
   - mention the hygiene exception: unsealed gems and application products cannot be returned.
6. **Products › Add products › Scheduled fetch**, one feed per target:
   - French feed `https://<domain>/feeds/google-fr.xml`: language French, countries France, Belgium, Luxembourg;
   - English feed `https://<domain>/feeds/google-en.xml`: language English, the other target countries. In each
     country, check that Merchant Center accepts English;
   - fetch daily, currency EUR.
7. Free listings are on by default (Merchant Center › Growth › Manage programs). Read the **Diagnostics** tab after
   the first fetch and send any item-level errors to a developer.

## Meta: catalogue only (owner's steps)

No Instagram Shop, no Conversions API.

1. **Business Manager**: business.facebook.com, the business's Meta Business account.
2. **Domain verification** (Business settings › Brand safety › Domains):
   - add the domain;
   - verify it with a DNS TXT record (Vercel › Domains › DNS records), or with the meta-tag method if a developer
     adds the tag.
3. **Catalogue** (Commerce Manager › Add catalogue › E-commerce):
   - data source: Data feed › Scheduled feed;
   - URL `https://<domain>/feeds/google-fr.xml` (Meta reads Google's format), daily;
   - optionally add the English feed as a second source or as a language/country version.
4. **Pixel** (Events Manager › Connect data sources › Web):
   - create the pixel and copy its id (a number);
   - in its settings, keep **Automatic advanced matching OFF**: the site sends no e-mail, name or phone, and the
     cookie policy says so;
   - also turn off "Track events automatically without code" if it is offered.
5. **Vercel**:
   - add `NEXT_PUBLIC_META_PIXEL_ID` = that id (Settings › Environment Variables, Production);
   - redeploy;
   - only then does the cookie banner offer "Advertising" and the cookie and privacy policies describe the pixel.
     Without the variable, nothing changes.
6. Link the pixel to the catalogue (Commerce Manager › the catalogue › Events) so ViewContent / AddToCart / Purchase
   events match its items.

## The Meta Pixel in the code

- Category `advertising` in `webapp/src/lib/cookieConsent.tsx`.
  - Off by default and separate from analytics.
  - Offered only when `NEXT_PUBLIC_META_PIXEL_ID` is set and Supabase is configured (`lib/metaPixelConfig.ts`).
  - Visitors who chose before the category existed are not asked again until their choice expires (6 months). Until
    then the pixel stays off for them.
- `webapp/src/lib/metaPixel.tsx`:
  - loads `fbevents.js` only after consent and only on `/fr/…` and `/en/…` pages, never on the guest withdrawal page;
  - no automatic events (`autoConfig` off), no history tracking of its own, no user data;
  - leaving the storefront or withdrawing consent revokes the pixel (`fbq('consent','revoke')`); withdrawing also
    erases `_fbp` / `_fbc`.
- Events:

  | Event | When |
  | --- | --- |
  | PageView | each storefront page |
  | ViewContent | product page |
  | AddToCart | "Add to cart" |
  | InitiateCheckout | card payment starts |
  | Purchase | confirmation page once the order is paid, or an order paid in full by gift cards; once per order, event id = order number |

  The value is the cart's indicative amount (the database prices the order).
- The wording of the banner, the cookie policy and the privacy policy is in the lawyer checklist
  (`supabase/README.md` › Review of 2026-11-11).
