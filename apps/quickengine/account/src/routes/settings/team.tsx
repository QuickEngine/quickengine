import { createFileRoute, Navigate } from "@tanstack/react-router";

function Page() {
	return <Navigate to="/team" replace />;
}

export const Route = createFileRoute("/settings/team")({
	component: Page,
});
