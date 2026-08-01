import { Background } from "@quickengine/ui";
import { QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { queryClient } from "./lib/api";
import { listenForNativeAuth } from "./lib/native-auth";
import { routeTree } from "./routeTree.gen";
import { initSentry } from "./sentry";
import "./styles.css";

initSentry();

/**
 * Mark the document when running inside the Tauri shell.
 *
 * The same build serves the browser and the native window, so the app has to
 * know which it is in: macOS draws its traffic lights OVER the content with an
 * overlay title bar, and without an inset the header renders underneath them.
 *
 * A data attribute rather than a Tauri import — `NATIVE_CLIENTS.md` requires no
 * Tauri-only APIs in shared code, and this is a presence check on a global, not
 * a dependency. In a browser it is simply absent and every `[data-tauri]` rule
 * never matches.
 */
if ("__TAURI_INTERNALS__" in window) {
	document.documentElement.setAttribute("data-tauri", "");
}

/**
 * Catch the sign-in handoff coming back from the system browser.
 *
 * Registered before the router mounts so a callback that arrives during launch
 * is not missed. No-ops outside the shell.
 *
 * It reloads rather than routing. The API client reads the credential once, at
 * module scope, so a token that arrives afterwards would not reach it — and a
 * reload is what someone expects after signing in anyway.
 */
listenForNativeAuth(() => {
	window.location.replace("/");
});

const router = createRouter({
	routeTree,
	defaultPreload: "intent",
	scrollRestoration: true,
	context: { queryClient },
});

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root");

createRoot(root).render(
	<StrictMode>
		<Background />
		<QueryClientProvider client={queryClient}>
			<RouterProvider router={router} />
		</QueryClientProvider>
	</StrictMode>,
);
