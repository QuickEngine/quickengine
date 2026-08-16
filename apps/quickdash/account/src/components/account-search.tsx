import {
	ActivityIcon,
	AppWindowIcon,
	ChartPieSliceIcon,
	CreditCardIcon,
	HeadsetIcon,
	KeyIcon,
	LockKeyIcon,
	PlugIcon,
	ShieldCheckIcon,
	UsersThreeIcon,
} from "@phosphor-icons/react";
import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@quickengine/ui/components/ui/command";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { accountQueries, useActiveOrganization } from "../lib/account-api";

const destinations = [
	{
		label: "Workspaces",
		detail: "Create and manage workspaces",
		href: "/workspaces",
		icon: AppWindowIcon,
	},
	{
		label: "Overview",
		detail: "How this organization is doing",
		href: "/",
		icon: ChartPieSliceIcon,
	},
	{
		label: "People",
		detail: "Members and pending invitations",
		href: "/team",
		icon: UsersThreeIcon,
	},
	{
		label: "Roles",
		detail: "What people are allowed to do",
		href: "/roles",
		icon: ShieldCheckIcon,
	},
	{
		label: "Integrations",
		detail: "Connected services",
		href: "/integrations",
		icon: PlugIcon,
	},
	{
		label: "Billing",
		detail: "Plan, credits and auto-recharge",
		href: "/billing",
		icon: CreditCardIcon,
	},
	{
		label: "Audit log",
		detail: "Organization activity",
		href: "/activity",
		icon: ActivityIcon,
	},
	{
		label: "Notifications",
		detail: "Account notifications",
		href: "/activity#notifications",
		icon: ActivityIcon,
	},
	{
		label: "Authentication",
		detail: "Passkeys and two-factor authentication",
		href: "/settings/security",
		icon: LockKeyIcon,
	},
	{
		label: "Sessions",
		detail: "Active account sessions",
		href: "/settings/security#sessions",
		icon: LockKeyIcon,
	},
	{
		label: "API keys",
		detail: "Workspace credentials",
		href: "/settings/api-keys",
		icon: KeyIcon,
	},
	{
		label: "Help and support",
		detail: "Guidance, feedback and support",
		href: "/support",
		icon: HeadsetIcon,
	},
] as const;

export function AccountSearch({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const { active } = useActiveOrganization();
	const workspaces = useQuery(accountQueries.workspaces(active?.id ?? ""));

	useEffect(() => {
		const openSearch = (event: KeyboardEvent) => {
			if (event.key.toLowerCase() !== "k" || (!event.metaKey && !event.ctrlKey))
				return;
			event.preventDefault();
			onOpenChange(!open);
		};
		document.addEventListener("keydown", openSearch);
		return () => document.removeEventListener("keydown", openSearch);
	}, [onOpenChange, open]);

	const go = (href: string) => {
		onOpenChange(false);
		window.location.assign(href);
	};

	return (
		<CommandDialog
			open={open}
			onOpenChange={onOpenChange}
			title="Search account"
			description="Find account pages and workspaces"
			showCloseButton={false}
			className="top-[18%] translate-y-0 border-[var(--console-line)] bg-[var(--console-pop)] text-[var(--ink-90)] shadow-2xl sm:max-w-2xl [&_[data-slot=command-input-wrapper]]:border-b-0"
		>
			<CommandInput
				placeholder="Search your account..."
				className="text-[13px] text-[var(--ink-90)] placeholder:text-[var(--ink-25)]"
			/>
			<CommandList className="max-h-[25rem] py-1">
				<CommandEmpty className="py-12 text-[12px] text-[var(--ink-35)]">
					Nothing found
				</CommandEmpty>
				{workspaces.data?.items.length ? (
					<CommandGroup
						heading="Workspaces"
						className="text-[var(--ink-90)] [&_[cmdk-group-heading]]:text-[9px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.14em] [&_[cmdk-group-heading]]:text-[var(--ink-25)]"
					>
						{workspaces.data.items.map((workspace) => (
							<CommandItem
								key={workspace.id}
								value={`${workspace.name} ${workspace.businessType} workspace`}
								onSelect={() =>
									go(
										workspace.slug
											? `/workspaces/${workspace.slug}`
											: "/workspaces",
									)
								}
								className="rounded-md text-[var(--ink-55)] data-[selected=true]:bg-[rgb(var(--console-ink)/0.07)] data-[selected=true]:text-[var(--ink-90)]"
							>
								<AppWindowIcon size={15} className="text-[var(--ink-35)]" />
								<p className="min-w-0 flex-1 truncate text-[12.5px]">
									{workspace.name}
								</p>
								<span className="shrink-0 text-[10.5px] text-[var(--ink-30)] capitalize">
									{workspace.archivedAt
										? "Archived workspace"
										: `${workspace.environment} workspace`}
								</span>
							</CommandItem>
						))}
					</CommandGroup>
				) : null}
				<CommandGroup
					heading="Account"
					className="text-[var(--ink-90)] [&_[cmdk-group-heading]]:text-[9px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.14em] [&_[cmdk-group-heading]]:text-[var(--ink-25)]"
				>
					{destinations.map((destination) => {
						const Icon = destination.icon;
						return (
							<CommandItem
								key={destination.href}
								value={`${destination.label} ${destination.detail}`}
								onSelect={() => go(destination.href)}
								className="rounded-md text-[var(--ink-55)] data-[selected=true]:bg-[rgb(var(--console-ink)/0.07)] data-[selected=true]:text-[var(--ink-90)]"
							>
								<Icon size={15} className="text-[var(--ink-35)]" />
								<p className="min-w-0 flex-1 truncate text-[12.5px]">
									{destination.label}
								</p>
								<span className="max-w-[55%] shrink-0 truncate text-[10.5px] text-[var(--ink-30)]">
									{destination.detail}
								</span>
							</CommandItem>
						);
					})}
				</CommandGroup>
			</CommandList>
			<div className="flex h-8 items-center justify-between px-3 text-[9.5px] text-[var(--ink-25)]">
				<span>Navigate with ↑ ↓</span>
				<span>Open with ↵</span>
			</div>
		</CommandDialog>
	);
}
