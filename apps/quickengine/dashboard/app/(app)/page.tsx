import type { Metadata } from "next";
import { WorkspacesToolbar } from "./workspaces-toolbar";

export const metadata: Metadata = { title: "Workspaces" };

// Workspaces is the account home — the first thing you land on. The cross-workspace
// Overview lives at /overview.
export default function Page() {
	return <WorkspacesToolbar />;
}
