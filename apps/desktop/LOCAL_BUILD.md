# Running the desktop shell against your own machine

`tauri dev` is not enough on macOS. Deep links are routed by LaunchServices to an
**installed bundle**, so a `quickdash://auth?token=…` callback cannot reach a bare
dev binary: sign-in opens the browser, comes back, and the running dev process
never hears it.

So build a bundle that points at the local dev server instead:

```
pnpm dash                                   # web on :3011 (plus auth :3002, api :3020)
cd apps/desktop
pnpm tauri build --config src-tauri/tauri.local.json
```

The bundle lands in `src-tauri/target/release/bundle/`. Keep **one** copy of
QuickDash installed at a time: two bundles sharing `xyz.quickdash.desktop` both
claim `quickdash://`, and which one macOS wakes is then a coin toss.

⚠️ `tauri.local.json` only overrides `build.frontendDist`. Everything else — the
signing identity, the URL scheme, the capabilities — comes from `tauri.conf.json`,
so a local build and a real one differ in exactly one property and nothing else
can drift between them.
