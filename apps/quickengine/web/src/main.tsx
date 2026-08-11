import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { recoverFromStaleChunk } from "@quickengine/ui/lib/stale-chunk";
import { PageSkeleton } from "./components/page-skeleton";
import { routeTree } from "./routeTree.gen";
import { initSentry } from "./sentry";

initSentry();

// `defaultPreload: "intent"` fetches route chunks on hover, so after a deploy the
// FIRST thing that fails is usually a preload — before any click. Vite fires this
// event for exactly that case. Catching it here means the new build is already
// loading while the visitor is still deciding whether to click, and they never
// see a failure at all.
//
// `preventDefault` stops Vite's default of rethrowing, which would otherwise
// surface as an unhandled rejection in Sentry for something already handled.
window.addEventListener("vite:preloadError", (event) => {
	event.preventDefault();
	recoverFromStaleChunk();
});

const router = createRouter({
	routeTree,
	// Marketing is public and cacheable; nothing here is user-specific.
	defaultPreload: "intent",
	scrollRestoration: true,

	// Every route, not just the root. Set on the root route it would only cover
	// the root's own transitions, and the pages people actually wait for are the
	// children.
	defaultPendingComponent: PageSkeleton,

	// ⚠️ Both numbers are a trade, and neither default was right for this site.
	//
	// `defaultPendingMs` is how long a navigation must stall before the skeleton
	// appears at all. The library default is 1000ms, which is long enough that a
	// visitor on a slow connection stares at the previous page wondering whether
	// their click registered. 450ms is past the point where a transition still
	// feels direct, so anything slower has already failed to feel instant and is
	// better acknowledged than hidden.
	defaultPendingMs: 450,

	// `defaultPendingMinMs` holds the skeleton once it HAS appeared, so content
	// landing a moment later does not produce a one-frame flash. It is the only
	// setting here that can delay real content, so it is deliberately short — the
	// library default of 500ms can hold a finished page back by half a second.
	// 200ms is enough to stop the flicker and little enough to not be a wait.
	defaultPendingMinMs: 200,
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
