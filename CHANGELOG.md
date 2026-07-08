# Changelog

All notable QuickEngine changes will be documented here.

This project is pre-release. Until QuickEngine has real users and a stable release process, changelog entries are maintained manually.

## [Unreleased]

### Added

- Vitest integration-testing foundation and the auth test suite. Tests run against a dedicated `quickengine_test` database (auto-provisioned from the committed migrations, truncated between tests) so they exercise the real auth wiring rather than mocks. The suite leads with failure paths: unverified accounts get no session, wrong/duplicate credentials, no user enumeration on password reset, 2FA blocking password-only sign-in, single-use recovery codes, bearer tokens working without cookies, and rate limiting. Flows that need a browser (passkey ceremony, OAuth round-trip) are marked pending for a later Playwright layer so the suite stays green. CI now runs Postgres so `pnpm test` executes the suite.
- Bearer-token authentication for native clients (desktop and mobile, both Tauri): the Better Auth bearer plugin exposes the session token in a `set-auth-token` response header and accepts `Authorization: Bearer <token>`, so native apps authenticate without cookies. No schema change. Added a cookie-free bearer test to the dev console.
- Two-factor authentication (TOTP) with recovery codes: a new `quickengine_two_factors` table plus a `two_factor_enabled` flag on users (with its migration), the Better Auth two-factor plugin on the auth server, the two-factor client plugin, and enable / verify / backup-code / disable controls on the dev console. With 2FA on, password sign-in requires a TOTP or recovery code to complete.
- WebAuthn passkey sign-in: a new `quickengine_passkeys` table (with its migration), the Better Auth passkey plugin on the auth server, the passkey client plugin, and register / sign-in / list controls on the dev console.
- `@better-auth/passkey` dependency, ahead of passwordless / passkey sign-in.
- Resend-backed email provider in `@quickengine/email`, with a console fallback that logs mail locally when no API key is set.
- Functional auth dev console (`/dev`) plus `/verify-email` and `/reset-password` pages in the auth app, and client exports for password reset and email verification. Email/password sign-in, email verification, and password reset confirmed working end to end.

### Changed

- Consolidated authentication to a single authority: removed the admin app's Better Auth handler so the auth app is the sole identity provider; added trusted origins, rate limiting, Next.js cookie handling, and shared `getSession` / `requireSession` helpers in `@quickengine/auth`.
- Authentication now requires email verification and sends verification and password-reset emails through the email provider.
- Added passwordless sign-in: email OTP and magic link, both delivered through the email provider (they reuse the existing verification table — no migration).
- Reduced the app registry and shared types to the two real apps: QuickEngine (the account layer) and QuickDash (the single flagship product), matching the single-flagship direction.
- Renamed subscription plan tiers to the Free / Starter / Pro / Growth / Team ladder plus Enterprise.
- Decoupled subscriptions from per-app identifiers, so billing is tier-based rather than per-app.
- Stripped the QuickEngine web front page to a bare black canvas ahead of a rebuild.
- Regenerated the baseline database migration to match the realigned schema.

### Removed

- QuickFlow as a standalone app: its web/admin URLs, `quickflow_workspaces` schema, and app-registry entry. QuickFlow now lives inside QuickDash as the automation module.
- The retired standalone-app registry entries (PDF, Image, Web, Text, and Dev tools, converters, business, productivity, AI, health, and video/audio). These are QuickDash modules or workspace types, not apps.
- The per-app catalog (`quickengine_apps`) and per-app entitlement (`quickengine_entitlements`) tables, which encoded the old per-app billing model.

### Fixed

- Tailwind CSS was never compiling — no app had a PostCSS config. Added `postcss.config.mjs` to web, admin, and auth, plus a Tailwind `@source` for `@quickengine/ui`, so utility classes and the shared shadcn component styles actually render. Rebuilt the auth dev console on shadcn components.
- Removed the deprecated `baseUrl` from the web, admin, and auth tsconfigs (path aliases resolve without it), clearing the TypeScript 7.0 deprecation error.
- Associated auth-panel form labels with their inputs via `htmlFor`/`id`.

### Security

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
