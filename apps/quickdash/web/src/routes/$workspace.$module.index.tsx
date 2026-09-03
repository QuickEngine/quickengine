import { useQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
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
import { quickDashQueries } from "../lib/quickdash-api";

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
	const context = useQuery(quickDashQueries.context(workspaceId));
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
	/**
	 * 🔴 Blank means "enabled but unbuilt". Anything else is a 404.
	 *
	 * The empty page above is deliberate for a module this workspace HAS whose
	 * surface is not written yet — honest, where "coming soon" would not be.
	 * But it was also what you got for `/neoengine/asdf`, which made the 404
	 * screen unreachable by the single commonest way of arriving at one.
	 *
	 * ⚠️ Wait for the context query before deciding. A 404 thrown while the
	 * module list is still loading would flash on every cold navigation.
	 *
	 * 🔑 "Not in this workspace's modules" covers both a nonsense id and a real
	 * module that is switched off, and both are honestly a 404 to the person
	 * looking: the page is not there. Which of the two it is belongs on the
	 * modules screen, not on an error wall. The alternative — importing the
	 * registry to tell them apart — would drag `@quickengine/db` into the
	 * browser bundle through its barrel.
	 */
	if (context.data && !context.data.modules.some((m) => m.id === module)) {
		throw notFound();
	}
	return <main className="min-h-full bg-[var(--console-bg)]" />;
}

export const Route = createFileRoute("/$workspace/$module/")({
	errorComponent: OutletError,
	notFoundComponent: OutletNotFound,
	component: ModuleIndex,
});
