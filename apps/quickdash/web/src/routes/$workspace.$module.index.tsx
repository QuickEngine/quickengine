import { createFileRoute } from "@tanstack/react-router";
import { BookingsView } from "../components/bookings-view";
import { ClientsView } from "../components/clients-view";
import { ContentView } from "../components/content-view";
import { ContractsView } from "../components/contracts-view";
import { FilesView } from "../components/files-view";
import { FulfillmentView } from "../components/fulfillment-view";
import { InventoryView } from "../components/inventory-view";
import { InvoicesView } from "../components/invoices-view";
import { OrdersView } from "../components/orders-view";
import { OutletError, OutletNotFound } from "../components/outlet-error";
import { PaymentsListView } from "../components/payments-list-view";
import { ProductsView } from "../components/products-view";
import { ProjectsView } from "../components/projects-view";
import { QuotesView } from "../components/quotes-view";
import { ShipmentsView } from "../components/shipments-view";
import { TimeView } from "../components/time-view";

/**
 * `/$workspace/$module` — a module's primary surface.
 *
 * 🔴 An `index` route, NOT the `$module` route itself. `$workspace.$module.tsx`
 * is the PARENT of `$workspace.$module.$section.tsx`, so rendering a view there
 * meant a sub-page like Orders → Discounts matched the child while the parent
 * still painted the orders list over it — which read as every sub-page wearing
 * its parent's search box.
 *
 * A module with no view yet renders nothing rather than a placeholder, because
 * an empty page is honest about being unbuilt and "coming soon" is not.
 */
function ModuleIndex() {
	const { module } = Route.useParams();
	const { workspaceId } = Route.useRouteContext();
	if (module === "products-services") {
		return <ProductsView workspaceId={workspaceId} />;
	}
	if (module === "orders") {
		return <OrdersView workspaceId={workspaceId} />;
	}
	if (module === "inventory") {
		return <InventoryView workspaceId={workspaceId} />;
	}
	if (module === "shipping") {
		return <ShipmentsView workspaceId={workspaceId} />;
	}
	if (module === "fulfillment") {
		return <FulfillmentView workspaceId={workspaceId} />;
	}
	if (module === "payments") {
		return <PaymentsListView workspaceId={workspaceId} />;
	}
	if (module === "invoicing") {
		return <InvoicesView workspaceId={workspaceId} />;
	}
	if (module === "quotes-estimates") {
		return <QuotesView workspaceId={workspaceId} />;
	}
	if (module === "client-records") {
		return <ClientsView workspaceId={workspaceId} />;
	}
	if (module === "bookings") {
		return <BookingsView workspaceId={workspaceId} />;
	}
	if (module === "projects-tasks") {
		return <ProjectsView workspaceId={workspaceId} />;
	}
	if (module === "time-tracking") {
		return <TimeView workspaceId={workspaceId} />;
	}
	if (module === "files") {
		return <FilesView workspaceId={workspaceId} />;
	}
	if (module === "contracts-esign") {
		return <ContractsView workspaceId={workspaceId} />;
	}
	if (module === "content") {
		return <ContentView workspaceId={workspaceId} />;
	}
	return <main className="min-h-full bg-[var(--console-bg)]" />;
}

export const Route = createFileRoute("/$workspace/$module/")({
	errorComponent: OutletError,
	notFoundComponent: OutletNotFound,
	component: ModuleIndex,
});
