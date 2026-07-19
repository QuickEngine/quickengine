import type { Metadata } from "next";
import { CreateOrgForm } from "./create-org-form";

export const metadata: Metadata = { title: "Create organization" };

export default function Page() {
	return (
		<div className="mx-auto max-w-lg space-y-6 p-6">
			<div>
				<h1 className="font-semibold text-2xl text-foreground">
					Create an organization
				</h1>
				<p className="mt-2 text-muted-foreground text-sm">
					An organization is a shared space with its own members, roles, and
					workspaces — separate from your personal account. You'll be its owner,
					and it becomes your active organization.
				</p>
			</div>
			<CreateOrgForm />
		</div>
	);
}
