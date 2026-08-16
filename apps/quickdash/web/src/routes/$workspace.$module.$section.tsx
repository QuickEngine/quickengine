import { createFileRoute } from "@tanstack/react-router";
import { PaymentsView } from "../components/payments-view";

/**
 * `/$workspace/$module/$section` — a module's secondary capabilities.
 *
 * 🔑 One route rather than a file per capability: Categories, Zones, Rates,
 * Adjustments, Discounts, Providers, Messages, Tasks, Folders and Traffic are
 * all "a module, narrowed", and the module already knows which sections it has.
 * A file each would mean twenty routes that differ only in a string.
 *
 * Sections are filled in one at a time; the rest render nothing rather than a
 * placeholder, because an empty page is honest about being unbuilt.
 */
function Page() {
	const { workspace, module, section } = Route.useParams();
	// Connecting a provider lives under Payments → Providers, where somebody
	// looking for it would go. The module root is the payments themselves.
	if (module === "payments" && section === "providers") {
		return <PaymentsView workspaceId={workspace} />;
	}
	return <main className="min-h-full bg-[var(--console-bg)]" />;
}

export const Route = createFileRoute("/$workspace/$module/$section")({
	component: Page,
});
