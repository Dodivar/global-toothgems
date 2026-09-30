# Migration of `webapp/` from Vite + React Router to Next.js (App Router)

Living document. **Every session that works on this migration reads it first and updates it in the same commit** (phase status, route checklist, log, open decisions). The decision itself and its rationale are recorded in `AGENTS.md` §4 and `global-toothgems-llm-guidelines/02-architecture-and-engineering.md`.

## Decision in one paragraph

`webapp/` moves from a Vite single-page application to Next.js App Router, deployed on Vercel, in place (same `webapp/` folder). Reasons: server-rendered, indexable and shareable public pages (SEO, social previews, real 404s) and server-side route protection. Supabase (schema, RLS, the 35+ migrations, Auth already in production), the Edge Functions planned for Stripe and e-mail, react-i18next, Tailwind v4 and Vitest stay. Out of scope for the whole migration unless decided separately: new features, visual changes, SQL schema changes, Stripe work, a move to next-intl.

## Rules for every phase

1. **No visible change.** No route, text or style changes unless the user asks. The Playwright smoke tests (`webapp/e2e/`, `npm run test:e2e`) are the reference: they must pass before and after each step.
2. Exit criteria of every phase: `npx tsc -b` (phase 0) / `npm run typecheck` (from phase 1), `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` — all run and green, results written in the log below.
3. Ask the user, never decide alone: the locale URL format (`/fr`, `/en` or another scheme), the Vercel project switch (the user does it), the Supabase Auth redirect URLs.
4. Only the publishable key is public (`NEXT_PUBLIC_*`). The service-role key and provider secrets never reach Next.js code.
5. Business rules stay in Postgres / Edge Functions. A server-side route guard is navigation, not authorization: RLS is.

## Inventory (measured on `dev` at 82864d0, 2026-09-30)

The brief quoted 96 routes, 152 files importing react-router and ~75 files touching browser globals; `dev` moved since. Measured with `grep` on `webapp/src`:

| Item | Count | Why it matters |
| --- | --- | --- |
| `<Route>` elements in `src/App.tsx` | 99 (104 addressable patterns once the mapped legal aliases and Studio share paths are expanded) | every one must keep working in the catch-all shell, then be moved to an App Router segment |
| Files importing `react-router-dom` | 158 | `Link`, `NavLink`, `Navigate`, `useNavigate`, `useLocation`, `useParams`, `useSearchParams` (97 files use the hooks) — replaced by `next/link` / `next/navigation` when their route is migrated, removed in phase 5 |
| Files using `window` | 75 | cannot run during server rendering; each needs `useEffect`, a client component boundary or a guard before its page is server-rendered |
| Files using `document.` | 52 | same |
| Files using `localStorage` / `sessionStorage` | 11 | same; includes the i18n language detector (`gt-lang`), cookie consent, favourites, Studio stores |
| Union of the above | 117 files | the real SSR work in phases 3–4 |

Other facts that shape the plan:

- **Studio 3D (three.js, three-mesh-bvh):** the editor and the share viewer are lazy chunks (`React.lazy`) loading `src/assets/studio3d/dentition.glb`. WebGL only exists in the browser: these routes stay client-only (`dynamic(..., { ssr: false })` or a client component that mounts the engine in an effect) even after phase 4.
- **Supabase Auth:** `src/lib/supabase/client.ts` creates one browser client with `persistSession`, `autoRefreshToken` and `detectSessionInUrl: true` — the session lives in `localStorage` and e-mail links use the implicit flow (tokens in the URL fragment, read by `authLinkErrorFromUrl` and the confirmation/reset pages). A server never sees a fragment nor `localStorage`: phase 2 moves the session to cookies (`@supabase/ssr`) and e-mail links to the PKCE flow (`?code=` exchanged by a route handler), which changes the redirect URLs configured in Supabase Auth.
- **Redirect URLs are built from `window.location.origin`** (`authRedirect.ts`, `passwordRecovery.ts`, `accountCredentials.ts`, `studioWorkspace/share.ts`): local development must keep port 5173 or the Supabase allow-list must change.
- **Route guards are client components:** `RequireAccount` (→ `/connexion`), `RequireAdmin` (→ `/admin/connexion`), `RequireStudioAccess` (lets everyone in during the preview).
- **i18n:** react-i18next with `i18next-browser-languagedetector`, language cached in `localStorage` (`gt-lang`), French default; `DocumentLanguage` sets `<html lang>` after mount. The server cannot know the language today — this ties SSR to the locale URL decision.
- **Vite-only code:** `import.meta.env.VITE_*` (Supabase client), `import.meta.glob` (`lib/images.ts`), `new URL(\`../assets/photos/${name}\`, import.meta.url)` (six `data/*.ts` fixtures), `?url` import of the `.glb`, image imports used as strings (20 files).
- **Bundle:** the Vite build ships a 3.2 MB (830 kB gzip) main chunk: every page is in it except the Studio editor/share chunks. Code-splitting per route is a phase 3–4 benefit, not a phase 1 goal.
- **Status codes:** the SPA (and the phase 1 shell) answer HTTP 200 for every path, including unknown ones rendered as the 404 page. Real 404s come with phase 3.

## Strategy

| Phase | Goal | Content | Status |
| --- | --- | --- | --- |
| 0 | Framing | Decision recorded (AGENTS.md §4, guidelines 02/08), this file, Playwright smoke tests passing on the Vite app | done (2026-09-30) |
| 1 | Next.js shell | Next.js installed in `webapp/`; the existing app runs unchanged from `app/[[...slug]]/page.tsx` through `dynamic(() => import(App), { ssr: false })` with `BrowserRouter` (official guide "Migrating from Vite"); Tailwind v4 via PostCSS; `VITE_*` → `NEXT_PUBLIC_*`; `vercel.json` removed; Vitest kept | see phase 1 log |
| 2 | Auth on the server | `@supabase/ssr`: browser client + server client, session in cookies, `proxy.ts` (Next.js 16 name of middleware) refreshing the session and redirecting signed-out visitors away from `/compte/*`, `/academy/mes-formations/*`, `/academy/lecon` and `/admin/*` (client guards stay as a second layer); PKCE e-mail links through an auth route handler; Supabase redirect URLs updated **by the user** | not started — needs the redirect-URL decision |
| 3 | Public pages SSR + SEO | Home, shop, shapes, colours, product, gift card, loyalty, Studio and Academy sales pages, help and legal pages as App Router segments rendered on the server (data read with the publishable key), `generateMetadata`, canonical/OG, structured data, `notFound()`, sitemap/robots; `window`/`localStorage` code behind client boundaries | not started — needs the locale URL decision |
| 4 | Account, back office, Studio | `/compte/*`, community, learner pages, `/admin/*`, Studio editor/share as App Router segments (mostly client components under server-protected layouts); Studio stays client-only | not started |
| 5 | Cleanup | Remove the catch-all shell, react-router-dom, SPA-only helpers (`ScrollToTop`, `DocumentLanguage`…), dead Vite leftovers; update READMEs | not started |

A route leaves the catch-all shell only when its App Router page exists, its smoke test (added if missing) passes, and every link to it still works from the shell (a full page load between the two worlds is acceptable during phases 3–4).

## Phase 1 — how the shell works

- `webapp/app/layout.tsx` — root layout: `<html lang="fr">`, the Google Fonts `<link>`s and the title/favicon formerly in `index.html`, the global stylesheet `src/index.css`.
- `webapp/app/[[...slug]]/page.tsx` — the only page. It renders `ClientApp`, which loads `src/ClientApp.tsx` (former `main.tsx`: i18n init, `StrictMode`, `BrowserRouter`, `App`) with `dynamic(..., { ssr: false })`: nothing from the React Router app runs on the server. `generateStaticParams` returns only `/`; other paths are rendered on demand by the same page.
- Environment: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (the publishable key only). Empty = mock mode, as before.
- Vitest runs from `vitest.config.ts` (Vite stays a development dependency of Vitest only).

## Route checklist

Legend — **Access**: open / account (`RequireAccount`) / staff (`RequireAdmin`) / studio (`RequireStudioAccess`) / redirect (client-side `Navigate`). **P1**: served by the catch-all shell. **Smoke**: covered by `webapp/e2e/`. **Native**: App Router segment exists. **SSR**: rendered on the server with metadata (public pages only). Target phase in the last column.

### Storefront

| Route | Access | P1 | Smoke | Native | SSR | Target |
| --- | --- | --- | --- | --- | --- | --- |
| `/` | open | ⬜ | ✅ | ⬜ | ⬜ | 3 |
| `/accueil-b` → `/` | redirect | ⬜ | ✅ | ⬜ | — | 3 (server redirect) |
| `/boutique` | open | ⬜ | ✅ | ⬜ | ⬜ | 3 |
| `/boutique-b` → `/boutique` | redirect | ⬜ | ✅ | ⬜ | — | 3 (server redirect) |
| `/boutique/:id` | open | ⬜ | ✅ | ⬜ | ⬜ | 3 |
| `/formes` | open | ⬜ | ✅ | ⬜ | ⬜ | 3 |
| `/couleurs` | open | ⬜ | ✅ | ⬜ | ⬜ | 3 |
| `/panier` | open | ⬜ | ✅ (cart flow) | ⬜ | — (client) | 3 |
| `/fidelite` | open | ⬜ | ✅ | ⬜ | ⬜ | 3 |
| `/carte-cadeau` | open | ⬜ | ✅ | ⬜ | ⬜ | 3 |
| `/gift-card` (alias, same page) | open | ⬜ | ⬜ | ⬜ | — | 3 (canonical → `/carte-cadeau`) |

### Sign-in, registration, recovery

| Route | Access | P1 | Smoke | Native | SSR | Target |
| --- | --- | --- | --- | --- | --- | --- |
| `/connexion` | open | ⬜ | ✅ (mock sign-in) | ⬜ | — | 2 |
| `/connexion-b` → `/connexion` | redirect | ⬜ | ✅ | ⬜ | — | 2 |
| `/inscription` | open | ⬜ | ✅ (mock registration) | ⬜ | — | 2 |
| `/mot-de-passe-oublie`, `/forgot-password` | open | ⬜ | ✅ (FR) | ⬜ | — | 2 |
| `/reinitialiser-mot-de-passe`, `/reset-password` | open (e-mail link) | ⬜ | ✅ (FR) | ⬜ | — | 2 |
| `/verifier-email`, `/verify-email` | open (e-mail link) | ⬜ | ✅ (FR) | ⬜ | — | 2 |
| `/confirmation-compte` | open (Supabase confirmation link) | ⬜ | ✅ | ⬜ | — | 2 |

### Studio 3D

| Route | Access | P1 | Smoke | Native | SSR | Target |
| --- | --- | --- | --- | --- | --- | --- |
| `/studio-3d` | open | ⬜ | ✅ | ⬜ | ⬜ | 3 |
| `/studio-3d/abonnement` | open | ⬜ | ✅ | ⬜ | ⬜ | 3 |
| `/studio-3d/subscribe` → `/studio-3d/abonnement` | redirect | ⬜ | ✅ | ⬜ | — | 3 |
| `/studio-3d/atelier/*` (editor, lazy three.js) | studio | ⬜ | ✅ (canvas renders) | ⬜ | — (client only) | 4 |
| `/studio-3d/editor/*` → `/studio-3d/atelier/*` | redirect | ⬜ | ⬜ | ⬜ | — | 4 |
| `/studio-3d/partage`, `/studio-3d/partage/:token` | open (lazy three.js) | ⬜ | ✅ (no token) | ⬜ | — (client only) | 4 |
| `/studio-3d/share`, `/studio-3d/share/:token` → `partage` | redirect | ⬜ | ⬜ | ⬜ | — | 4 |

### Academy

| Route | Access | P1 | Smoke | Native | SSR | Target |
| --- | --- | --- | --- | --- | --- | --- |
| `/academy` | open | ⬜ | ✅ | ⬜ | ⬜ | 3 |
| `/academy/formation/:id` | open | ⬜ | ✅ | ⬜ | ⬜ | 3 |
| `/academy/lecon` | account | ⬜ | ⬜ | ⬜ | — | 4 |
| `/academy/mes-formations/:courseId` | account | ⬜ | ⬜ | ⬜ | — | 4 |
| `/academy/mes-formations/:courseId/lecon/:nodeKey` | account | ⬜ | ⬜ | ⬜ | — | 4 |
| `/academy/mes-formations/:courseId/terminee` | account | ⬜ | ⬜ | ⬜ | — | 4 |

### Member area (`MemberShell`, account)

| Route | Access | P1 | Smoke | Native | SSR | Target |
| --- | --- | --- | --- | --- | --- | --- |
| `/compte` | account | ⬜ | ✅ (redirect + mock sign-in) | ⬜ | — | 4 |
| `/compte/attestations` | account | ⬜ | ⬜ | ⬜ | — | 4 |
| `/compte/commandes` | account | ⬜ | ✅ (redirect) | ⬜ | — | 4 |
| `/compte/profil` | account | ⬜ | ⬜ | ⬜ | — | 4 |
| `/compte/securite` | account | ⬜ | ⬜ | ⬜ | — | 4 |
| `/compte/fidelite` | account | ⬜ | ⬜ | ⬜ | — | 4 |
| `/compte/avis` | account | ⬜ | ⬜ | ⬜ | — | 4 |
| `/compte/*` (404 inside the shell) | account | ⬜ | ⬜ | ⬜ | — | 4 |
| `/compte/communaute` | account | ⬜ | ⬜ | ⬜ | — | 4 |
| `/compte/communaute/canal/:channelId` | account | ⬜ | ⬜ | ⬜ | — | 4 |
| `/compte/communaute/discussion/:discussionId` | account | ⬜ | ⬜ | ⬜ | — | 4 |
| `/compte/communaute/activite/:view` | account | ⬜ | ⬜ | ⬜ | — | 4 |
| `/compte/communaute/membres` | account | ⬜ | ⬜ | ⬜ | — | 4 |
| `/compte/communaute/charte` | account | ⬜ | ⬜ | ⬜ | — | 4 |
| `/compte/communaute/*` (404) | account | ⬜ | ⬜ | ⬜ | — | 4 |

### Back office (`AdminLayout`, staff)

| Route | Access | P1 | Smoke | Native | SSR | Target |
| --- | --- | --- | --- | --- | --- | --- |
| `/admin/connexion` | open | ⬜ | ✅ | ⬜ | — | 2 |
| `/admin` | staff | ⬜ | ✅ (redirect) | ⬜ | — | 4 |
| `/admin/commandes`, `/admin/commandes/:reference` | staff | ⬜ | ⬜ | ⬜ | — | 4 |
| `/admin/clients`, `/admin/clients/:id` | staff | ⬜ | ⬜ | ⬜ | — | 4 |
| `/admin/utilisateurs` | staff | ⬜ | ⬜ | ⬜ | — | 4 |
| `/admin/statistiques` | staff | ⬜ | ⬜ | ⬜ | — | 4 |
| `/admin/produits` | staff | ⬜ | ✅ (redirect) | ⬜ | — | 4 |
| `/admin/produits/nouveau`, `/admin/produits/:id`, `/admin/produits/:id/recommandations` | staff | ⬜ | ⬜ | ⬜ | — | 4 |
| `/admin/categories` | staff | ⬜ | ⬜ | ⬜ | — | 4 |
| `/admin/promotions`, `/nouvelle`, `/apercu`, `/:id`, `/:id/modifier` | staff | ⬜ | ⬜ | ⬜ | — | 4 |
| `/admin/promotions/cartes-cadeaux/configuration`, `/cartes-cadeaux/:code` | staff | ⬜ | ⬜ | ⬜ | — | 4 |
| `/admin/promotions/campagnes/nouvelle`, `/:id`, `/:id/modifier` | staff | ⬜ | ⬜ | ⬜ | — | 4 |
| `/admin/avis` | staff | ⬜ | ⬜ | ⬜ | — | 4 |
| `/admin/parametres` | staff | ⬜ | ⬜ | ⬜ | — | 4 |
| `/admin/formations`, `/nouvelle`, `/:id`, `/:id/apercu`, `/:id/publication` | staff | ⬜ | ⬜ | ⬜ | — | 4 |

### Help centre and legal pages

| Route | Access | P1 | Smoke | Native | SSR | Target |
| --- | --- | --- | --- | --- | --- | --- |
| `/aide` | open | ⬜ | ✅ | ⬜ | ⬜ | 3 |
| `/aide/faq` | open | ⬜ | ✅ | ⬜ | ⬜ | 3 |
| `/contact` | open | ⬜ | ✅ | ⬜ | ⬜ | 3 |
| `/a-propos` | open | ⬜ | ✅ | ⬜ | ⬜ | 3 |
| `/mentions-legales` | open | ⬜ | ✅ | ⬜ | ⬜ | 3 |
| `/conditions-generales` | open | ⬜ | ✅ | ⬜ | ⬜ | 3 |
| `/confidentialite` | open | ⬜ | ✅ | ⬜ | ⬜ | 3 |
| `/cookies` | open | ⬜ | ✅ | ⬜ | ⬜ | 3 |
| `/livraison` | open | ⬜ | ✅ | ⬜ | ⬜ | 3 |
| `/retours-remboursements` | open | ⬜ | ✅ | ⬜ | ⬜ | 3 |
| English aliases `/help`, `/faq`, `/shipping`, `/returns`, `/legal-notice`, `/terms-of-sale`, `/privacy-policy`, `/cookie-policy`, `/about` | redirect | ⬜ | ✅ (`/help`, `/privacy-policy`, `/terms-of-sale`) | ⬜ | — | 3 (server redirects) |

### System pages

| Route | Access | P1 | Smoke | Native | SSR | Target |
| --- | --- | --- | --- | --- | --- | --- |
| `/erreur` | open | ⬜ | ✅ | ⬜ | — | 3 (becomes `error.tsx`) |
| `/maintenance` | open | ⬜ | ✅ | ⬜ | — | 3 |
| `*` (404) | open | ⬜ | ✅ | ⬜ | — | 3 (`not-found.tsx`, real 404 status) |

## Open decisions (ask the user)

| Decision | Needed by | Status |
| --- | --- | --- |
| Locale URL format (`/fr/...` + `/en/...`, French without prefix + `/en/...`, or keep the toggle) and hreflang | phase 3 | open |
| Supabase Auth redirect URLs (Site URL, allow-list, PKCE callback path) | phase 2 | open |
| Vercel project switch to the Next.js framework preset | before the first Next.js deployment | the user does it |

## Log

Newest first. For each session: what changed, the commands run and their real results.

### 2026-09-30 — Phase 0

- Decision recorded in `AGENTS.md` §3–§5, guidelines 02, 07 and 08; this file created.
- Playwright 1.63 added (`playwright.config.ts`, `e2e/`, `npm run test:e2e`, `tsconfig.e2e.json`); Vitest limited to `src/**/*.test.{ts,tsx}`.
- Results on the Vite app (mock mode): `npx tsc -b` OK; `npm run lint` 0 errors (existing warnings only); `npm test` 24 files / 271 tests passed; `npm run build` OK; `npm run test:e2e` 48 passed.
