import { createFileRoute } from "@tanstack/react-router";


function Page() {
	return null;
}

export const Route = createFileRoute("/settings/team")({
	component: Page,
});
