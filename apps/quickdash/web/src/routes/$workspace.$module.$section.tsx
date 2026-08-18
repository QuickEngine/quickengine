import { createFileRoute } from "@tanstack/react-router";
import { AdjustmentsView } from "../components/adjustments-view";
import { CategoriesView } from "../components/categories-view";
import { DiscountsView } from "../components/discounts-view";
import { FoldersView } from "../components/folders-view";
import { MessagesView } from "../components/messages-view";
import { PartnerLinksView } from "../components/partner-links-view";
import { PaymentsView } from "../components/payments-view";
import { RatesView } from "../components/rates-view";
import { ReviewsView } from "../components/reviews-view";
import { SuppliersView } from "../components/suppliers-view";
import { TasksView } from "../components/tasks-view";
import { ZonesView } from "../components/zones-view";

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
	const { module, section } = Route.useParams();
	const { workspaceId } = Route.useRouteContext();
	// Connecting a provider lives under Payments → Providers, where somebody
	// looking for it would go. The module root is the payments themselves.
	if (module === "payments" && section === "providers") {
		return <PaymentsView workspaceId={workspaceId} />;
	}
	if (module === "files" && section === "folders") {
		return <FoldersView workspaceId={workspaceId} />;
	}
	if (module === "projects-tasks" && section === "tasks") {
		return <TasksView workspaceId={workspaceId} />;
	}
	if (module === "client-records" && section === "messages") {
		return <MessagesView workspaceId={workspaceId} />;
	}
	if (module === "shipping" && section === "zones") {
		return <ZonesView workspaceId={workspaceId} />;
	}
	if (module === "shipping" && section === "rates") {
		return <RatesView workspaceId={workspaceId} />;
	}
	if (module === "inventory" && section === "adjustments") {
		return <AdjustmentsView workspaceId={workspaceId} />;
	}
	// Suppliers sits under Inventory rather than in a module of its own: it only
	// matters to a business that does not make its own product, which is the
	// same business already tracking stock.
	if (module === "inventory" && section === "suppliers") {
		return <SuppliersView workspaceId={workspaceId} />;
	}
	if (module === "orders" && section === "discounts") {
		return <DiscountsView workspaceId={workspaceId} />;
	}
	// Beside Discounts because a partner link carries one, and because somebody
	// looking for "how do I give a creator a code" looks where codes live.
	if (module === "orders" && section === "partners") {
		return <PartnerLinksView workspaceId={workspaceId} />;
	}
	if (module === "products-services" && section === "categories") {
		return <CategoriesView workspaceId={workspaceId} />;
	}
	if (module === "products-services" && section === "reviews") {
		return <ReviewsView workspaceId={workspaceId} />;
	}
	return <main className="min-h-full bg-[var(--console-bg)]" />;
}

export const Route = createFileRoute("/$workspace/$module/$section")({
	component: Page,
});
