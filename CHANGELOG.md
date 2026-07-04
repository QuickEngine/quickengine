# Changelog

All notable QuickEngine changes will be documented here.

This project is pre-release. Until QuickEngine has real users and a stable release process, changelog entries are maintained manually.

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
