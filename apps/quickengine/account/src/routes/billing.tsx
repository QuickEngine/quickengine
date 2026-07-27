import { createFileRoute, Navigate } from "@tanstack/react-router";

function BillingIndex() {
	return <Navigate to="/billing/plans" replace />;
}

export const Route = createFileRoute("/billing")({
	component: BillingIndex,
});
