# Changelog

All notable QuickEngine changes will be documented here.

This project is pre-release. Until QuickEngine has real users and a stable release process, changelog entries are maintained manually.

## [Unreleased]

### Added

- The account **dashboard** is now a real, session-protected panel instead of a bare white page: the void-black theme + self-hosted brand fonts + mesh background (matching web and auth), a header showing the signed-in email and a working sign-out, and a placeholder Overview. Its tab title now follows the `Page | QuickEngine` convention too.
- Consistent status/error pages across **all three apps** (web, auth, dashboard): a **404**, a segment **error boundary** (500) with retry, a root **global-error** fallback, and a route-level **loading** state — all built from shared `StatusScreen` / `LoadingScreen` / `GlobalErrorScreen` in `@quickengine/ui`, so every app's 404/500/loading looks identical (only the link target differs). No more default Next 404 on web/dashboard.
- QuickEngine web front door (skeleton, pre-polish): a fixed frosted-glass header (logo mark + centered nav — Products / Pricing / Resources / Contact — with a hover-dim interaction and contiguous hit areas, plus Sign in + a Get Started pill), a locked-in responsive `.page-gutter` margin standard, the self-hosted brand fonts (Clash Grotesk display + General Sans body via `next/font/local`, no external CDN flash), and a mesh + grain site background. The header's Sign in / Get Started now link out to the auth app.
- Polished the whole **auth app** — every user-facing screen (sign in, sign up, verify email, reset password) now carries the on-brand UI instead of the old raw forms, matching the marketing site pixel-for-pixel (same fonts, void-black theme, mesh background, and monochrome FontAwesome Google/GitHub marks). All existing methods stay wired: email/password, Google/GitHub, magic link, passkey, forgot-password, and the 2FA challenge + recovery-code step. The auth root redirects straight to sign in (no marketing front page). Reset and verify now have proper new-password (with confirmation) and resend flows.
- **nuqs** for URL-persisted state, wired into all three apps (web, auth, dashboard) so future UI state (pricing toggle, dashboard filters/tabs) can live in shareable, refresh-proof URLs. First use: the auth `?redirect=` target is now read through nuqs — and hardened with an **open-redirect guard** so a crafted `?redirect=https://evil.com` is ignored and only our own app origins are honored.
- Stripe billing backend in `@quickengine/billing`: a single-source plan config (tier names are placeholders; prices are env-driven Stripe price IDs, never hardcoded amounts), Stripe customer management (self-healing — recreates the customer if the stored one no longer exists at Stripe), checkout-session creation, and a webhook that syncs the subscription lifecycle (created/updated/deleted, invoice paid/failed) into `quickengine_subscriptions`. The hand-rolled checkout/webhook routes now call this package via the official Stripe SDK. Added a basic billing dev console (`/dev/billing`) plus checkout success/cancel pages to run sandbox payments, and a money-path test suite (plan mapping, webhook sync, checkout + customer self-heal with Stripe mocked). Also wired the shared dark theme into the web app so its pages render. CI already runs Postgres for these tests. Confirmed end to end against Stripe test mode: checkout → payment → subscription recorded.
- Adversarial unit tests for the **open-redirect guard**. The post-auth `?redirect=` resolver was extracted into a pure, dependency-free core (`_redirect.ts`) and covered with real attack cases — external origins, protocol-relative `//host`, userinfo `…@evil.com`, look-alike subdomains, scheme mismatches, and `javascript:`/`data:` payloads all fall back to the dashboard, while our own app URLs are honored. Runs DB-free via a new minimal vitest config on the auth app (the existing integration suite still owns the DB-backed flows).
- Vitest integration-testing foundation and the auth test suite. Tests run against a dedicated `quickengine_test` database (auto-provisioned from the committed migrations, truncated between tests) so they exercise the real auth wiring rather than mocks. The suite leads with failure paths: unverified accounts get no session, wrong/duplicate credentials, no user enumeration on password reset, 2FA blocking password-only sign-in, single-use recovery codes, bearer tokens working without cookies, and rate limiting. Flows that need a browser (passkey ceremony, OAuth round-trip) are marked pending for a later Playwright layer so the suite stays green. CI now runs Postgres so `pnpm test` executes the suite.
- Bearer-token authentication for native clients (desktop and mobile, both Tauri): the Better Auth bearer plugin exposes the session token in a `set-auth-token` response header and accepts `Authorization: Bearer <token>`, so native apps authenticate without cookies. No schema change. Added a cookie-free bearer test to the dev console.
- Two-factor authentication (TOTP) with recovery codes: a new `quickengine_two_factors` table plus a `two_factor_enabled` flag on users (with its migration), the Better Auth two-factor plugin on the auth server, the two-factor client plugin, and enable / verify / backup-code / disable controls on the dev console. With 2FA on, password sign-in requires a TOTP or recovery code to complete.
- WebAuthn passkey sign-in: a new `quickengine_passkeys` table (with its migration), the Better Auth passkey plugin on the auth server, the passkey client plugin, and register / sign-in / list controls on the dev console.
- `@better-auth/passkey` dependency, ahead of passwordless / passkey sign-in.
- Resend-backed email provider in `@quickengine/email`, with a console fallback that logs mail locally when no API key is set.
- Functional auth dev console (`/dev`) plus `/verify-email` and `/reset-password` pages in the auth app, and client exports for password reset and email verification. Email/password sign-in, email verification, and password reset confirmed working end to end.

### Changed

- Consolidated duplicate env vars to one canonical name per URL: dropped `NEXT_PUBLIC_APP_URL` (same as `NEXT_PUBLIC_QUICKENGINE_WEB_URL`) and `NEXT_PUBLIC_DASHBOARD_URL` (same as `NEXT_PUBLIC_QUICKENGINE_DASHBOARD_URL`) from the env schema, the auth trusted-origins list, the checkout route, and `.env.example`. Also removed the now-redundant `.optional()` on the optional server-env fields (the `emptyStringAsUndefined` helper already makes them optional).
- Dropped the aurora-blue accent from the shared theme: `--primary`, `--accent`, and `--ring` are now neutral, so the palette stays fully monochrome void-black until a real accent is chosen.
- Consolidated the shared UI into **`@quickengine/ui`** so apps stop redefining the same look. The void-black theme, mesh + grain background, brand fonts, and the auth shell / status-screen / form-and-button primitives now live once in the package (a `brand.css` layer + a `fonts` export + a component barrel); web, auth, and dashboard import them instead of keeping per-app copies of the theme, fonts, and `Background`. New apps inherit the look for free. Each app keeps only a thin `globals.css` (import the shared base + brand, scan the package) and genuinely app-specific bits (e.g. web's `.page-gutter`).
- Sessions now last **30 days on a sliding window** (refresh-on-use), up from 7. Active users effectively stay signed in; only ~30 days of real inactivity logs them out — a meal break or a long weekend never does.
- Unified the browser identity across all three apps: the same favicon (the web app's mark) now ships in web, auth, and dashboard, and every app uses one tab-title convention — `Page | QuickEngine`. Each page carries its own name (Sign In, Sign Up, Verify Email, Reset Password, Overview, Checkout Complete, …) instead of a single bare app title.
- Dropped hyphens from the auth page routes: `/sign-in` → `/signin`, `/sign-up` → `/signup`, `/verify-email` → `/verify`, `/reset-password` → `/reset`. Better Auth's own API endpoints (`/api/auth/sign-in/…`) are unchanged. All internal links and the password-reset / email-verification callback URLs were updated to match.
- Renamed the `apps/quickengine/admin` app to `apps/quickengine/dashboard` (`@quickengine/dashboard`) — it's the user-facing account panel, not staff tooling. Env vars `NEXT_PUBLIC_ADMIN_URL` → `NEXT_PUBLIC_DASHBOARD_URL` and `NEXT_PUBLIC_QUICKENGINE_ADMIN_URL` → `NEXT_PUBLIC_QUICKENGINE_DASHBOARD_URL` (QuickDash's admin URLs unchanged).
- Consolidated authentication to a single authority: removed the admin app's Better Auth handler so the auth app is the sole identity provider; added trusted origins, rate limiting, Next.js cookie handling, and shared `getSession` / `requireSession` helpers in `@quickengine/auth`.
- Authentication now requires email verification and sends verification and password-reset emails through the email provider.
- Added passwordless sign-in: email OTP and magic link, both delivered through the email provider (they reuse the existing verification table — no migration).
- Reduced the app registry and shared types to the two real apps: QuickEngine (the account layer) and QuickDash (the single flagship product), matching the single-flagship direction.
- Renamed subscription plan tiers to the Free / Starter / Pro / Growth / Team ladder plus Enterprise.
- Decoupled subscriptions from per-app identifiers, so billing is tier-based rather than per-app.
- Stripped the QuickEngine web front page to a bare black canvas ahead of a rebuild.
- Regenerated the baseline database migration to match the realigned schema.

### Removed

- The `/dev` consoles — the auth flow test surface (`auth/dev`) and the billing dev console (`web/dev/billing`). They were scaffolding; the real sign-in/up screens now cover auth, and account/billing management is moving into the dashboard. Checkout success/cancel pages link home instead of the removed console. (A fresh dev/test surface can be added later if needed.)
- ~5 MB of unused font kits from `web/public` (`GeneralSans_Complete`, `ClashGrotesk_Complete`) — fonts are now served once from `@quickengine/ui`.
- QuickFlow as a standalone app: its web/admin URLs, `quickflow_workspaces` schema, and app-registry entry. QuickFlow now lives inside QuickDash as the automation module.
- The retired standalone-app registry entries (PDF, Image, Web, Text, and Dev tools, converters, business, productivity, AI, health, and video/audio). These are QuickDash modules or workspace types, not apps.
- The per-app catalog (`quickengine_apps`) and per-app entitlement (`quickengine_entitlements`) tables, which encoded the old per-app billing model.

### Fixed

- Blank optional env vars broke the production build. A set-but-empty variable (e.g. `AUTH_COOKIE_DOMAIN=`) was converted to `undefined` and then failed its inner `string` check, so `next build` errored even though the field was marked optional. The `emptyStringAsUndefined` helper now makes the inner schema optional, so a blank value is correctly treated as unset. This blocked building the auth app locally.
- Tailwind CSS was never compiling — no app had a PostCSS config. Added `postcss.config.mjs` to web, admin, and auth, plus a Tailwind `@source` for `@quickengine/ui`, so utility classes and the shared shadcn component styles actually render. Rebuilt the auth dev console on shadcn components.
- Removed the deprecated `baseUrl` from the web, admin, and auth tsconfigs (path aliases resolve without it), clearing the TypeScript 7.0 deprecation error.
- Associated auth-panel form labels with their inputs via `htmlFor`/`id`.

### Security

- The dashboard requires a valid session: unauthenticated visitors are redirected to the auth app's sign-in (carrying a redirect back), and every dashboard response is served `no-store` (via Next 16's `proxy` convention, the successor to the deprecated `middleware`) so the browser back button can't reveal account content after sign-out.
- Signed-in users are redirected away from the sign-in / sign-up pages. Each page is now a server component that checks the session before rendering, so an already-authenticated visitor is sent to their destination instead of the login form — the browser back button can no longer park a live session back on `/signin`. The redirect target is validated against our own app origins (shared open-redirect guard), same on the server and client.
- Added root pnpm overrides for `esbuild` and `postcss` to force patched transitive versions and clear Dependabot alerts.

## [0.1.0] - Foundation

### Added

- Initial QuickEngine monorepo scaffold.
- QuickEngine web and admin app shells.
- Shared packages for auth, database, UI, env, billing, cache, email, jobs, monitoring, search, storage, realtime, analytics, SDK, and app metadata.
- Root environment example and typed env validation.
- GitHub Actions CI and secrets scan workflows.
- Dependabot configuration.
- Husky and lint-staged setup.
- Gitleaks allowlist for non-secret historical placeholders.
- Stripe checkout and webhook scaffolds.
- QuickEngine web deployment to `https://quickengine.vercel.app`.
- Internal build checklist and priority order docs.

### Changed

- Repository prepared for public visibility.
- Polar/Reown references removed from active billing setup in favor of Stripe.
- QuickDash and other product apps parked until QuickEngine foundation is ready.

### Notes

- Release automation is intentionally disabled until versioning policy is finalized.
- Current version remains `0.1.0` while auth, account, billing, and launch foundations are built.
