import { createFileRoute } from "@tanstack/react-router";
import { SecuritySettings } from "../../components/security-settings";

function Page() {
	return (
		<main className="p-6">
			<h1 className="mb-6 font-semibold text-2xl">Security</h1>
			<SecuritySettings />
		</main>
	);
}

export const Route = createFileRoute("/settings/security")({
	component: Page,
});
