import type { Metadata } from "next";
import { NewWorkspaceForm } from "./workspace-form";

export const metadata: Metadata = { title: "New Workspace" };

export default function Page() {
	return <NewWorkspaceForm />;
}
