import { Button } from "@quickengine/ui/components/ui/button";
import { Input } from "@quickengine/ui/components/ui/input";
import { Label } from "@quickengine/ui/components/ui/label";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { accountQueries, useActiveOrganization } from "../lib/account-api";
import { api } from "../lib/api";

function TeamPage() {
	const queryClient = useQueryClient();
	const { active } = useActiveOrganization();
	const organizationId = active?.id ?? "";
	const members = useQuery(accountQueries.members(organizationId));
	const invitations = useQuery(accountQueries.invitations(organizationId));
	const [error, setError] = useState<string | null>(null);
	const invalidate = () =>
		Promise.all([
			queryClient.invalidateQueries({
				queryKey: ["account", organizationId, "members"],
			}),
			queryClient.invalidateQueries({
				queryKey: ["account", organizationId, "invitations"],
			}),
		]);
	const invite = useMutation({
		mutationFn: (input: { email: string; role: string }) =>
			api.request(`/account/invitations?organizationId=${organizationId}`, {
				method: "POST",
				body: input,
			}),
		onSuccess: invalidate,
		onError: (cause) =>
			setError(cause instanceof Error ? cause.message : "Invite failed."),
	});
	const removeMember = useMutation({
		mutationFn: (userId: string) =>
			api.request(
				`/account/members/${userId}?organizationId=${organizationId}`,
				{ method: "DELETE" },
			),
		onSuccess: invalidate,
		onError: (cause) =>
			setError(cause instanceof Error ? cause.message : "Removal failed."),
	});
	const revokeInvitation = useMutation({
		mutationFn: (id: string) =>
			api.request(
				`/account/invitations/${id}?organizationId=${organizationId}`,
				{ method: "DELETE" },
			),
		onSuccess: invalidate,
		onError: (cause) =>
			setError(cause instanceof Error ? cause.message : "Revoke failed."),
	});

	if (members.isPending || invitations.isPending) {
		return <main className="p-6">Loading team…</main>;
	}
	if (members.isError || invitations.isError) {
		throw members.error ?? invitations.error;
	}

	const submit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setError(null);
		const data = new FormData(event.currentTarget);
		invite.mutate({
			email: String(data.get("email") ?? ""),
			role: String(data.get("role") ?? "member"),
		});
	};

	return (
		<main className="space-y-8 p-6">
			<div>
				<h1 className="font-semibold text-2xl">Team</h1>
				<p className="mt-1 text-muted-foreground text-sm">
					People with access to {active?.name}.
				</p>
			</div>
			<form
				onSubmit={submit}
				className="grid gap-3 rounded-xl border border-foreground/10 p-5 md:grid-cols-[1fr_12rem_auto]"
			>
				<div className="space-y-2">
					<Label htmlFor="invite-email">Email</Label>
					<Input id="invite-email" name="email" type="email" required />
				</div>
				<div className="space-y-2">
					<Label htmlFor="invite-role">Role</Label>
					<Input id="invite-role" name="role" defaultValue="member" required />
				</div>
				<Button className="self-end" disabled={invite.isPending}>
					Send invitation
				</Button>
			</form>
			<section className="space-y-3">
				<h2 className="font-medium">Members</h2>
				{members.data.items.map((member) => (
					<div
						key={member.userId}
						className="flex items-center justify-between rounded-lg border border-foreground/10 p-4"
					>
						<div>
							<p>{member.name || member.email}</p>
							<p className="text-muted-foreground text-sm">
								{member.email} · {member.role}
							</p>
						</div>
						<Button
							variant="outline"
							onClick={() => removeMember.mutate(member.userId)}
						>
							Remove
						</Button>
					</div>
				))}
			</section>
			{invitations.data.items.length > 0 && (
				<section className="space-y-3">
					<h2 className="font-medium">Invitations</h2>
					{invitations.data.items.map((invitation) => (
						<div
							key={invitation.id}
							className="flex items-center justify-between rounded-lg border border-foreground/10 p-4"
						>
							<p>
								{invitation.email} · {invitation.role} · {invitation.status}
							</p>
							<Button
								variant="outline"
								onClick={() => revokeInvitation.mutate(invitation.id)}
							>
								Revoke
							</Button>
						</div>
					))}
				</section>
			)}
			{error && <p className="text-destructive text-sm">{error}</p>}
		</main>
	);
}

export const Route = createFileRoute("/team")({
	component: TeamPage,
});
