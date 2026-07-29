import { Button } from "@quickengine/ui/components/ui/button";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { api } from "../../lib/api";

function JoinPage() {
	const { token } = Route.useParams();
	const navigate = useNavigate();
	const invitation = useQuery({
		queryKey: ["account", "invitation", token],
		queryFn: async () =>
			(
				await api.request<{
					email: string;
					role: string;
					organizationName?: string;
				}>(`/account/invitations/${token}`)
			).data,
	});
	const accept = useMutation({
		mutationFn: () =>
			api.request(`/account/invitations/${token}/accept`, { method: "POST" }),
		onSuccess: () => navigate({ to: "/" }),
	});
	if (invitation.isPending)
		return <main className="p-6">Loading invitation…</main>;
	if (invitation.isError) {
		return (
			<main className="mx-auto max-w-lg p-6 text-center">
				This invitation is no longer valid.
			</main>
		);
	}
	return (
		<main className="mx-auto max-w-lg space-y-5 p-6 text-center">
			<h1 className="font-semibold text-2xl">Join organization</h1>
			<p className="text-muted-foreground">
				You were invited as {invitation.data.role}.
			</p>
			<Button onClick={() => accept.mutate()} disabled={accept.isPending}>
				{accept.isPending ? "Joining…" : "Accept invitation"}
			</Button>
			{accept.isError && (
				<p className="text-destructive text-sm">{accept.error.message}</p>
			)}
		</main>
	);
}

export const Route = createFileRoute("/join/$token")({
	component: JoinPage,
});
