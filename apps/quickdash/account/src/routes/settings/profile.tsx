import { createFileRoute } from "@tanstack/react-router";
import { ProfileSettings } from "../../components/profile-settings";

function Page() {
	return (
		<main className="p-6">
			<h1 className="mb-6 font-semibold text-2xl">Profile</h1>
			<ProfileSettings />
		</main>
	);
}

export const Route = createFileRoute("/settings/profile")({
	component: Page,
});
