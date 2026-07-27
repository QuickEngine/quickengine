import { createFileRoute } from "@tanstack/react-router";
import { redirect } from "@tanstack/react-router";

// /billing → the plans page (the billing home).
function Page() {
	redirect("/billing/plans");
}

export const Route = createFileRoute("/billing")({
	component: Page,
});
