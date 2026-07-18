import { getSession } from "@quickengine/auth/server";
import { db, eq, getInvitationByToken } from "@quickengine/db";
import { quickengineOrganizations } from "@quickengine/db/schema/quickengine";
import { Button } from "@quickengine/ui/components/ui/button";
import type { Metadata } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { AcceptForm } from "./accept-form";

export const metadata: Metadata = { title: "Accept invitation" };

const ROLE_LABEL: Record<string, string> = {
	owner: "Owner",
	admin: "Admin",
	member: "Member",
};

function Shell({ children }: { children: ReactNode }) {
	return (
		<main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center p-6">
			<div className="rounded-2xl border border-foreground/[0.08] p-8">
				{children}
			</div>
		</main>
	);
}

export default async function Page({
	params,
}: {
	params: Promise<{ token: string }>;
}) {
	const { token } = await params;
	const invitation = await getInvitationByToken(token);

	if (!invitation) {
		return (
			<Shell>
				<h1 className="font-semibold text-xl">Invitation unavailable</h1>
				<p className="mt-2 text-muted-foreground text-sm">
					This invitation link is invalid, has expired, or has already been
					used.
				</p>
			</Shell>
		);
	}

	const [org] = await db
		.select({ name: quickengineOrganizations.name })
		.from(quickengineOrganizations)
		.where(eq(quickengineOrganizations.id, invitation.organizationId))
		.limit(1);
	const session = await getSession(await headers());
	const orgName = org?.name ?? "an organization";

	return (
		<Shell>
			<h1 className="font-semibold text-xl">Join {orgName}</h1>
			<p className="mt-2 text-muted-foreground text-sm">
				You've been invited to join {orgName} as{" "}
				<strong>{ROLE_LABEL[invitation.role] ?? invitation.role}</strong>.
			</p>
			{session ? (
				<div className="mt-6">
					<AcceptForm token={token} />
				</div>
			) : (
				<div className="mt-6 space-y-3">
					<p className="text-sm">
						Sign in to your QuickEngine account to accept, then reopen this
						link.
					</p>
					<Button asChild variant="outline">
						<a href="/">Go to sign in</a>
					</Button>
				</div>
			)}
		</Shell>
	);
}
