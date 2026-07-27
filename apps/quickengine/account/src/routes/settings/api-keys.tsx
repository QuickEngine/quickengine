import { createFileRoute } from "@tanstack/react-router";

function Page() {
	return (
		<main className="max-w-2xl space-y-3 p-6">
			<h1 className="font-semibold text-2xl">API keys</h1>
			<p className="text-muted-foreground">
				API keys are scoped to a workspace. Open a workspace to create, review,
				or revoke its keys.
			</p>
		</main>
	);
}

export const Route = createFileRoute("/settings/api-keys")({
	component: Page,
});
