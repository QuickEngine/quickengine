# QuickDash Desktop

One Tauri v2 shell targeting macOS, Windows and Linux. Platform-specific copies
of the product are not created — this is a window around `apps/quickdash/web`.

## The update model

**The UI is not bundled.** `frontendDist` points at the deployed origin rather
than a copy of `dist`, so a UI change ships the moment it deploys: no release, no
updater run, and no version skew between what the browser shows and what the app
shows.

QuickDash cannot function without the API, so bundling would buy no offline
capability while costing an update cycle for every visual fix.

The Tauri updater therefore only ever ships a new **shell** — a Tauri upgrade or
a new native capability — which is rare.

## Running it

Three terminals — the shell attaches to servers you start, it does not launch
them:

```bash
pnpm --filter @quickengine/api dev       # :3020
pnpm dash                                # :3011
pnpm --filter @quickengine/desktop dev   # the window
```

There is deliberately no `beforeDevCommand`: those servers stay up across
sessions, so having Tauri start its own means a second Vite on an occupied port
and the whole run fails.

## Before this can ship

- [ ] **Icons.** `src-tauri/icons/` has the brand SVG only. Run
      `pnpm --filter @quickengine/desktop tauri icon src-tauri/icons/icon.svg`
      to generate every required size.
- [x] **Updater signing key.** ✅ 2026-08-01. The public key is in
      `tauri.conf.json` — it is meant to be published; that is how a client
      verifies an update it downloads. The private key lives outside the
      repository and reaches CI as `TAURI_SIGNING_PRIVATE_KEY` plus
      `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
- [ ] **Release manifests.** The updater expects
      `quickdash.xyz/releases/desktop/{target}-{arch}.json`. Nothing serves that
      yet.
- [ ] **Code signing + notarisation.** Both are paid certificates and **neither
      blocks a launch.** Windows and Linux builds need no certificate at all;
      Android needs none. Only macOS distribution does, and until that is bought
      the macOS build is hosted on our own site with install instructions rather
      than shipped through Gatekeeper's happy path.
- [x] **Auth in a webview.** ✅ 2026-08-01. Sign-in opens the system browser and
      returns a bearer token over `quickdash://`; the shell never shows a
      provider's webview sign-in. See `DECISIONS.md` and `native-auth.ts`.

## Capabilities

🔴 `src-tauri/capabilities/default.json` is not optional. The window loads a
REMOTE origin, and a remote origin can invoke no plugin command without being
listed in `remote.urls` — deep link and opener would both fail silently, which
looks exactly like a broken sign-in. The URLs are patterns, not origins: a bare
`https://quickdash.xyz` matches only the root path, so every route past `/` would
lose access.

## Mobile

Tauri v2 supports iOS and Android from this same project. Mobile is a
**companion** surface — desktop is the full one — so the wrapped responsive UI is
the intended experience rather than a native rewrite. Not initialised yet; that
is `tauri ios init` / `tauri android init` and belongs with Step 12.
