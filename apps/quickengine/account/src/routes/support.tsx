import { createFileRoute } from "@tanstack/react-router";
import { clientEnv } from "../lib/env";

function Page() {
	return (
		<main className="max-w-2xl space-y-4 p-6">
			<h1 className="font-semibold text-2xl">Support</h1>
			<p className="text-muted-foreground">
				Find product guidance and contact QuickEngine support from the help
				center.
			</p>
			<a
				href={`${clientEnv.WEB_URL}/support`}
				className="inline-flex rounded-lg bg-foreground px-4 py-2 text-background"
			>
				Open support
			</a>
		</main>
	);
}

export const Route = createFileRoute("/support")({
	component: Page,
});
