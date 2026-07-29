import { Background } from "@quickengine/ui";
import { QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { queryClient } from "./lib/api";
import { routeTree } from "./routeTree.gen";
import { initSentry } from "./sentry";

initSentry();

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

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Missing #root");

createRoot(rootElement).render(
	<StrictMode>
		<Background />
		<QueryClientProvider client={queryClient}>
			<RouterProvider router={router} />
		</QueryClientProvider>
	</StrictMode>,
);
