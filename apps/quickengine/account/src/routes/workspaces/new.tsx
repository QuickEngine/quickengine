import { createFileRoute } from "@tanstack/react-router";
import { NewWorkspaceForm } from "./workspace-form";


function Page() {
	return <NewWorkspaceForm />;
}

export const Route = createFileRoute("/workspaces/new")({
	component: Page,
});
