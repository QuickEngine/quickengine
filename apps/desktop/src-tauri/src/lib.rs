//! The QuickDash desktop shell.
//!
//! Deliberately almost empty. The product is the web application; this is a
//! window around it, and every line of logic added here is a line that has to be
//! kept in step with a UI it does not own.
//!
//! **The UI is not bundled.** `tauri.conf.json` points the window at the
//! deployed QuickDash origin rather than a copy of `dist`, which means a UI
//! change ships the moment it deploys — no release, no updater, no version skew
//! between what the browser shows and what the app shows. QuickDash cannot
//! function without the API anyway, so bundling would buy no offline capability
//! and cost an update cycle for every visual fix.
//!
//! The updater therefore only ever ships a new *shell* — a new Tauri version, a
//! new native capability — which is rare.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
	tauri::Builder::default()
		.plugin(tauri_plugin_updater::Builder::new().build())
		// Registers `quickdash://`. The web layer subscribes to the event and
		// stores the token; nothing is interpreted here, because the shell should
		// not know what a session is.
		.plugin(tauri_plugin_deep_link::init())
		// Sign-in opens here, not in this window. See `native-auth.ts`.
		.plugin(tauri_plugin_opener::init())
		.run(tauri::generate_context!())
		.expect("error while running QuickDash");
}
