import {
	SidebarContent,
	SidebarGroup,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@quickengine/ui/components/ui/sidebar";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PortalShell } from "@/components/portal-shell";
import {
	type CustomerContext,
	customerApi,
	sectionsFor,
	session,
} from "@/lib/api";

/**
 * The portal.
 *
 * Everything visible is derived from the workspace behind the publishable key —
 * its name in the header, its enabled modules in the rail. Nothing about the
 * business is hardcoded, so one deployment serves every client.
 */
function Portal() {
	const queryClient = useQueryClient();
	const [active, setActive] = useState<string | null>(null);

	const context = useQuery({
		queryKey: ["context"],
		queryFn: customerApi.context,
		retry: false,
	});

	if (context.isPending) {
		return <main className="p-6 text-muted-foreground text-sm">Loading…</main>;
	}

	if (context.isError) {
		// Almost always a missing or wrong publishable key. Say so plainly rather
		// than showing an empty portal that looks like the business has no records.
		return (
			<main className="p-6">
				<h1 className="font-medium text-lg">
					This portal isn&rsquo;t configured
				</h1>
				<p className="mt-2 max-w-md text-muted-foreground text-sm">
					{(context.error as Error).message}
				</p>
			</main>
		);
	}

	const data = context.data as CustomerContext;
	const sections = sectionsFor(data.modules);
	const current = active ?? sections[0]?.id ?? null;

	return (
		<PortalShell
			brand={
				<span className="truncate font-medium text-sm">
					{data.workspace.name}
				</span>
			}
			account={
				data.signedIn ? (
					<button
						type="button"
						onClick={async () => {
							await customerApi.signOut().catch(() => undefined);
							session.clear();
							queryClient.invalidateQueries();
						}}
						className="text-muted-foreground text-sm hover:text-foreground"
					>
						Sign out
					</button>
				) : null
			}
			nav={
				<SidebarContent>
					<SidebarGroup>
						<SidebarGroupLabel>Your account</SidebarGroupLabel>
						<SidebarMenu>
							{sections.map((section) => (
								<SidebarMenuItem key={section.id}>
									<SidebarMenuButton
										isActive={section.id === current}
										onClick={() => setActive(section.id)}
									>
										<span>{section.label}</span>
									</SidebarMenuButton>
								</SidebarMenuItem>
							))}
						</SidebarMenu>
					</SidebarGroup>
				</SidebarContent>
			}
		>
			{data.signedIn ? (
				<RecordList section={current} />
			) : (
				<SignIn businessName={data.workspace.name} />
			)}
		</PortalShell>
	);
}

/**
 * Sign-in.
 *
 * Deliberately says "if that address has an account" rather than confirming one
 * exists — the API answers identically either way, and a UI that promised
 * otherwise would leak exactly what the endpoint refuses to.
 */
function SignIn({ businessName }: { businessName: string }) {
	const [email, setEmail] = useState("");
	const request = useMutation({ mutationFn: customerApi.requestLink });

	if (request.isSuccess) {
		return (
			<main className="p-6">
				<h1 className="font-medium text-lg">Check your email</h1>
				<p className="mt-2 max-w-md text-muted-foreground text-sm">
					If {email} has an account with {businessName}, a sign-in link is on
					its way. It expires in 15 minutes.
				</p>
			</main>
		);
	}

	return (
		<main className="p-6">
			<h1 className="font-medium text-lg">Sign in</h1>
			<p className="mt-2 max-w-md text-muted-foreground text-sm">
				Enter your email and we&rsquo;ll send you a link. No password.
			</p>
			<form
				className="mt-5 flex max-w-sm gap-2"
				onSubmit={(event) => {
					event.preventDefault();
					request.mutate(email);
				}}
			>
				<input
					type="email"
					required
					value={email}
					onChange={(event) => setEmail(event.target.value)}
					placeholder="you@example.com"
					className="h-9 flex-1 rounded-md border border-border bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
				/>
				<button
					type="submit"
					disabled={request.isPending}
					className="h-9 rounded-md bg-foreground px-4 font-medium text-background text-sm disabled:opacity-60"
				>
					{request.isPending ? "Sending…" : "Send link"}
				</button>
			</form>
		</main>
	);
}

function RecordList({ section }: { section: string | null }) {
	const records = useQuery({
		queryKey: ["records", section],
		queryFn: () =>
			customerApi.list(section as "orders" | "bookings" | "invoices"),
		enabled: section !== null,
		retry: false,
	});

	if (!section) {
		return (
			<main className="p-6 text-muted-foreground text-sm">
				This business has nothing to show here yet.
			</main>
		);
	}

	return (
		<main className="p-6">
			<h1 className="font-medium text-lg capitalize">{section}</h1>
			{records.isPending ? (
				<p className="mt-2 text-muted-foreground text-sm">Loading…</p>
			) : records.isError ? (
				<p className="mt-2 text-muted-foreground text-sm">
					{(records.error as Error).message}
				</p>
			) : records.data.items.length === 0 ? (
				<p className="mt-2 text-muted-foreground text-sm">Nothing here yet.</p>
			) : (
				<ul className="mt-4 divide-y divide-border">
					{records.data.items.map((item) => (
						<li key={String(item.id)} className="py-3 text-sm">
							{String(item.reference ?? item.number ?? item.id)}
						</li>
					))}
				</ul>
			)}
		</main>
	);
}

export const Route = createFileRoute("/")({ component: Portal });
