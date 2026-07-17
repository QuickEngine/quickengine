# Native

Future Rust/Tauri desktop and mobile applications live here.

The development standards prefer Tauri over Electron for native apps. Web products should stay in `apps/`, shared TypeScript code should stay in `packages/`, and native/Rust code should be introduced here only when QuickEngine starts a desktop, mobile, CLI, or performance-critical native surface.

Native clients will consume the same authenticated APIs and provider-neutral contracts
as the web surfaces. They must not receive direct database access or duplicate business
rules already owned by module packages.
