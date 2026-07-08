# Changelog

All notable QuickEngine changes will be documented here.

This project is pre-release. Until QuickEngine has real users and a stable release process, changelog entries are maintained manually.

## [Unreleased]

### Changed

- Reduced the app registry and shared types to the two real apps: QuickEngine (the account layer) and QuickDash (the single flagship product), matching the single-flagship direction.
- Renamed subscription plan tiers to the Free / Starter / Pro / Growth / Team ladder plus Enterprise.
- Decoupled subscriptions from per-app identifiers, so billing is tier-based rather than per-app.
- Stripped the QuickEngine web front page to a bare black canvas ahead of a rebuild.
- Regenerated the baseline database migration to match the realigned schema.

### Removed

- QuickFlow as a standalone app: its web/admin URLs, `quickflow_workspaces` schema, and app-registry entry. QuickFlow now lives inside QuickDash as the automation module.
- The retired standalone-app registry entries (PDF, Image, Web, Text, and Dev tools, converters, business, productivity, AI, health, and video/audio). These are QuickDash modules or workspace types, not apps.
- The per-app catalog (`quickengine_apps`) and per-app entitlement (`quickengine_entitlements`) tables, which encoded the old per-app billing model.

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
