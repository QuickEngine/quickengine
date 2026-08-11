import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { recoverFromStaleChunk } from "@quickengine/ui/lib/stale-chunk";
import { routeTree } from "./routeTree.gen";
import { initSentry } from "./sentry";

initSentry();

// Same guard as the marketing app. Every route here is code-split too, so a tab
// left open across a deploy is holding chunk names the server no longer has —
// and on THIS app that failure lands on somebody mid sign-in, which is the worst
// possible moment to show them an error about our infrastructure.
//
// `preventDefault` stops Vite rethrowing it as an unhandled rejection into
// Sentry for something already handled.
window.addEventListener("vite:preloadError", (event) => {
	event.preventDefault();
	recoverFromStaleChunk();
});

const router = createRouter({
	routeTree,
	defaultPreload: "intent",
	scrollRestoration: true,
});

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Missing #root");

createRoot(rootElement).render(
	<StrictMode>
		<RouterProvider router={router} />
	</StrictMode>,
);
