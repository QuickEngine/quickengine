import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { routeTree } from "./routeTree.gen";
import { initSentry } from "./sentry";

initSentry();

const router = createRouter({
	routeTree,
	// Marketing is public and cacheable; nothing here is user-specific.
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

// The boot fallback in index.html covers the cases where this file never runs:
// scripting off, a browser too old to parse the bundle, a script that never
// arrived. Reaching this line proves none of those happened, so it goes.
document.getElementById("boot-fallback")?.remove();
