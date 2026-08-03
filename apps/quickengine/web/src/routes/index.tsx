import { createFileRoute } from "@tanstack/react-router";
import { pageTitle } from "@/lib/seo";

/** No background of its own — it inherits the theme's, so it follows
    light/dark/system instead of pinning itself to black. */
function HomePage() {
	return <main className="min-h-dvh" />;
}

export const Route = createFileRoute("/")({
	head: () => ({ meta: [{ title: pageTitle("Home") }] }),
	component: HomePage,
});
