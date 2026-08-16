import { createFileRoute } from "@tanstack/react-router";

/**
 * `/$workspace/$module/$section` — a module's secondary capabilities.
 *
 * 🔑 One route rather than a file per capability: Categories, Zones, Rates,
 * Adjustments, Discounts, Providers, Messages, Tasks, Folders and Traffic are
 * all "a module, narrowed", and the module already knows which sections it has.
 * A file each would mean twenty routes that differ only in a string.
 *
 * ⚠️ Not built yet — the sidebar links here so the navigation is real while the
 * pages are designed one at a time.
 */
function Page() {
	return <main className="min-h-full bg-[var(--console-bg)]" />;
}

export const Route = createFileRoute("/$workspace/$module/$section")({
	component: Page,
});
