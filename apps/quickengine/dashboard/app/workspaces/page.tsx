import type { Metadata } from "next";
import { WorkspacesToolbar } from "./toolbar";

export const metadata: Metadata = { title: "Workspaces" };

export default function Page() {
	return <WorkspacesToolbar />;
}
