"use client";

import { CaretUpDown, Check, Plus } from "@phosphor-icons/react";
import { GeneratedAvatar } from "@quickengine/ui";
import { Avatar } from "@quickengine/ui/components/ui/avatar";
import { Badge } from "@quickengine/ui/components/ui/badge";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator,
} from "@quickengine/ui/components/ui/command";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@quickengine/ui/components/ui/popover";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setActiveOrgAction } from "../_lib/org-actions";

export type SwitcherOrg = { id: string; name: string; isPersonal: boolean };

// Organization switcher. Only the caret opens the popover; the mark + name + tier badge are
// display. Vercel-style: a search field filters the list. Selecting an org sets it active
// (server cookie) and refreshes; "Create organization" opens the create page.
export function TeamSwitcher({
	orgs,
	activeOrgId,
	tier = "Free",
}: {
	orgs: SwitcherOrg[];
	activeOrgId: string;
	tier?: string;
}) {
	const [open, setOpen] = useState(false);
	const [pending, startTransition] = useTransition();
	const router = useRouter();

	const active = orgs.find((org) => org.id === activeOrgId) ?? orgs[0];
	if (!active) return null;

	function switchTo(orgId: string) {
		if (orgId === activeOrgId) {
			setOpen(false);
			return;
		}
		startTransition(async () => {
			await setActiveOrgAction(orgId);
			router.refresh();
			setOpen(false);
		});
	}

	return (
		<div className="flex w-full items-center gap-2">
			<Avatar className="size-8 shrink-0">
				<GeneratedAvatar seed={`account:${active.id}`} className="size-full" />
			</Avatar>
			<span className="min-w-0 truncate font-normal text-[15px] text-foreground">
				{active.name}
			</span>
			<Badge
				variant="secondary"
				className="h-5 shrink-0 rounded-full border-transparent bg-foreground/10 px-2.5 font-medium text-[11px] text-foreground"
			>
				{tier}
			</Badge>
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger className="ml-auto flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-foreground/40">
					<CaretUpDown className="size-5" />
				</PopoverTrigger>
				<PopoverContent
					align="end"
					sideOffset={20}
					collisionPadding={8}
					className="w-80 p-0"
				>
					<Command>
						<CommandInput placeholder="Find organization..." />
						<CommandList>
							<CommandEmpty>No organizations found.</CommandEmpty>
							<CommandGroup heading="Organizations">
								{orgs.map((org) => (
									<CommandItem
										key={org.id}
										value={org.name}
										disabled={pending}
										onSelect={() => switchTo(org.id)}
										className="gap-2"
									>
										<Avatar className="size-6">
											<GeneratedAvatar
												seed={`account:${org.id}`}
												className="size-full"
											/>
										</Avatar>
										<span className="flex-1 truncate">{org.name}</span>
										{org.id === activeOrgId && (
											<Check className="size-4 shrink-0" />
										)}
									</CommandItem>
								))}
							</CommandGroup>
							<CommandSeparator />
							<CommandGroup>
								<CommandItem
									className="gap-2"
									onSelect={() => {
										setOpen(false);
										router.push("/organizations/new");
									}}
								>
									<Plus className="size-4" />
									Create organization
								</CommandItem>
							</CommandGroup>
						</CommandList>
					</Command>
				</PopoverContent>
			</Popover>
		</div>
	);
}
