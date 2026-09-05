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

/// How much smaller the app is than the website.
///
/// A desktop window is a fixed frame somebody lives in rather than one tab
/// among twenty, so fitting more of the product on screen is worth more than
/// the extra size.
///
/// 🔴 The WEBVIEW's zoom, not CSS `zoom`. CSS zoom scales boxes but leaves
/// viewport units alone, so the console frame's `h-svh` would come out at ninety
/// percent of the window and leave a band of empty ground along the bottom.
/// Browser zoom changes what a CSS pixel IS, so every unit including `svh` stays
/// correct and the frame fills the window exactly.
///
/// ⚠️ Applied HERE rather than from the page. Doing it in JavaScript needs the
/// `@tauri-apps/api` package in the web app, a capability to permit it, and a
/// first paint at full size before it takes effect.
const ZOOM: f64 = 0.9;

/// Tell the page whether macOS is currently drawing its window buttons.
///
/// 🔴 The room the header leaves for the traffic lights must come and go WITH
/// them. In fullscreen macOS takes the buttons away, and a gap that stays behind
/// is a hole in the header with nothing in it — the app looks like it is
/// permanently working around something that is not there. Every native app
/// does this: the controls slide left into the space the moment it is free.
///
/// ⚠️ Pushed from here rather than polled from the page. The window knows its
/// own state, and asking the operating system from JavaScript would need the
/// `@tauri-apps/api` package in the web app plus a capability to permit it.
fn mark_fullscreen(window: &tauri::WebviewWindow) {
	let full = window.is_fullscreen().unwrap_or(false);
	let _ = window.eval(&format!(
		"document.documentElement.dataset.shellFullscreen={};",
		if full { "\"true\"" } else { "\"\"" }
	));
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
	tauri::Builder::default()
		.setup(|app| {
			// ⚠️ Best effort. A window that opens at the website's size is the
			// state this app was in yesterday; it is not a reason to refuse to
			// start.
			if let Some(window) = tauri::Manager::get_webview_window(app, "main") {
				let _ = window.set_zoom(ZOOM);
				mark_fullscreen(&window);

				/*
				 * 🔴 Several events, not just resize.
				 *
				 * The flag is pushed into the PAGE, so anything that replaces the
				 * document throws it away: a dev server reload is the obvious one, and
				 * the sign-in handoff reloads too. Until the next event the header then
				 * believes whatever was true before — after leaving fullscreen it kept
				 * the fullscreen layout, so the traffic lights had no room reserved and
				 * the workspace name collapsed to a letter beside them.
				 *
				 * ⚠️ Focus and move are cheap and cover the case resize cannot: a
				 * reload while the window is left alone. The first thing anybody does
				 * with a window they are looking at is click it.
				 */
				let watched = window.clone();
				window.on_window_event(move |event| {
					if matches!(
						event,
						tauri::WindowEvent::Resized(_)
							| tauri::WindowEvent::Moved(_)
							| tauri::WindowEvent::Focused(_)
					) {
						mark_fullscreen(&watched);
					}
				});
			}
			Ok(())
		})
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
