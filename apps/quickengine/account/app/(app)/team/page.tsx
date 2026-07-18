import { can } from "@quickengine/auth/rbac";
import { getSession } from "@quickengine/auth/server";
import {
	getPersonalOrg,
	listOrganizationInvitations,
	listOrganizationMembers,
	resolveOrgRole,
} from "@quickengine/db";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { Panel, PanelLabel, StatCard } from "../../_components/surface";
import { InviteForm } from "./invite-form";
import { RevokeInviteButton } from "./revoke-invite-button";

export const metadata: Metadata = { title: "Team" };

const ROLE_LABEL: Record<string, string> = {
	owner: "Owner",
	admin: "Admin",
	member: "Member",
};

function formatDate(value: Date): string {
	return new Intl.DateTimeFormat("en", {
		month: "short",
		day: "numeric",
		year: "numeric",
	}).format(value);
}

export default async function Page() {
	const session = await getSession(await headers());
	if (!session) return null;
	const org = await getPersonalOrg(session.user.id);
	if (!org) return null;

	const [members, invitations, role] = await Promise.all([
		listOrganizationMembers(org.id),
		listOrganizationInvitations(org.id),
		resolveOrgRole(session.user.id, org.id),
	]);
	const canManage = role ? can(role, "members.manage") : false;
	const pending = invitations.filter((invite) => invite.status === "pending");

	return (
		<div className="space-y-4 p-6">
			<section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
				<StatCard
					label="Members"
					value={String(members.length)}
					hint="in this account"
				/>
				<StatCard
					label="Pending invites"
					value={String(pending.length)}
					hint="awaiting acceptance"
				/>
				<StatCard
					label="Your role"
					value={ROLE_LABEL[role ?? ""] ?? "—"}
					hint="on this account"
				/>
			</section>

			<Panel>
				<PanelLabel>Members</PanelLabel>
				<div className="mt-3 divide-y divide-foreground/[0.06]">
					{members.map((member) => (
						<div
							key={member.userId}
							className="flex items-center justify-between py-3 text-sm"
						>
							<div>
								<span className="text-foreground">{member.name}</span>
								<span className="ml-2 text-muted-foreground text-xs">
									{member.email}
								</span>
							</div>
							<span className="text-muted-foreground">
								{ROLE_LABEL[member.role] ?? member.role}
							</span>
						</div>
					))}
				</div>
			</Panel>

			{canManage && (
				<Panel>
					<PanelLabel>Invite a member</PanelLabel>
					<div className="mt-3">
						<InviteForm />
					</div>
				</Panel>
			)}

			<Panel>
				<PanelLabel>Pending invites</PanelLabel>
				{pending.length === 0 ? (
					<p className="mt-3 text-muted-foreground text-sm">
						No pending invitations.
					</p>
				) : (
					<div className="mt-3 divide-y divide-foreground/[0.06]">
						{pending.map((invite) => (
							<div
								key={invite.id}
								className="flex items-center justify-between gap-4 py-3 text-sm"
							>
								<div>
									<span className="text-foreground">{invite.email}</span>
									<span className="ml-2 text-muted-foreground text-xs">
										{ROLE_LABEL[invite.role] ?? invite.role} · expires{" "}
										{formatDate(invite.expiresAt)}
									</span>
								</div>
								{canManage && <RevokeInviteButton invitationId={invite.id} />}
							</div>
						))}
					</div>
				)}
			</Panel>
		</div>
	);
}
