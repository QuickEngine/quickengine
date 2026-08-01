import { CaretUpDown, Check, Plus } from "@phosphor-icons/react";
import { GeneratedAvatar } from "@quickengine/ui";
import { Avatar } from "@quickengine/ui/components/ui/avatar";
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
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

export type SwitcherOrg = { id: string; name: string; isPersonal: boolean };

// Organization switcher. Only the caret opens the popover; the mark + name + tier badge are
// display. Vercel-style: a search field filters the list. Selecting an org sets it active
// (server cookie) and refreshes; "Create organization" opens the create page.
export function TeamSwitcher({
	orgs,
	activeOrgId,
	tier = "Free",
	onSelect,
}: {
	orgs: SwitcherOrg[];
	activeOrgId: string;
	tier?: string;
	onSelect: (organizationId: string) => void;
}) {
	const [open, setOpen] = useState(false);
	const navigate = useNavigate();

	const active = orgs.find((org) => org.id === activeOrgId) ?? orgs[0];
	if (!active) return null;

	function switchTo(orgId: string) {
		if (orgId === activeOrgId) {
			setOpen(false);
			return;
		}
		onSelect(orgId);
		setOpen(false);
	}

	return (
		<div className="flex w-full items-center gap-2">
			<span className="size-6 shrink-0 overflow-hidden rounded-full ring-1 ring-edge">
				<GeneratedAvatar seed={`account:${active.id}`} className="size-full" />
			</span>
			{/* Name, tier and caret all INSIDE the trigger, matching QuickDash's
			    workspace switcher. Previously only the 20px caret was clickable while
			    the name sat inert beside it — a control that looks like one button has
			    to behave like one. */}
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger className="btn btn-secondary pointer-events-auto inline-flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-lg bg-void px-2.5 text-ink outline-none">
					<span className="truncate font-body text-[13px]">{active.name}</span>
					<span className="shrink-0 rounded-full bg-field px-2 py-0.5 font-body text-[10px] text-dim capitalize">
						{tier}
					</span>
					<CaretUpDown size={12} className="ml-auto shrink-0 text-dim" />
				</PopoverTrigger>
				<PopoverContent
					align="start"
					alignOffset={-32}
					sideOffset={8}
					collisionPadding={8}
					className="w-72 p-0 [&_[data-slot=command-input-wrapper]]:border-0"
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
										void navigate({ to: "/organizations/new" });
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
