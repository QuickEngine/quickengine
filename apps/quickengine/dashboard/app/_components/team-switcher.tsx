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
import { useState } from "react";

type Team = { id: string; name: string; seed: string };

// Team switcher. Only the caret opens the popover; the mark + name + tier badge
// are display. Vercel-style: a search field filters the team list. The team mark
// is seeded distinctly from the personal profile avatar so the two never render
// the same gradient.
export function TeamSwitcher({
	seed,
	name,
	tier = "Free",
}: {
	seed: string;
	name: string;
	tier?: string;
}) {
	const [open, setOpen] = useState(false);

	// Only the caller's own team exists for now; search still works over it, and
	// this is where additional teams will land once memberships are wired.
	const teams: Team[] = [{ id: seed, name, seed: `account:${seed}` }];
	const activeId = seed;
	const activeTeam = teams.find((t) => t.id === activeId) ?? teams[0];

	return (
		<div className="flex w-full items-center gap-2">
			<Avatar className="size-8 shrink-0">
				<GeneratedAvatar seed={activeTeam.seed} className="size-full" />
			</Avatar>
			<span className="min-w-0 truncate font-normal text-[15px] text-foreground">
				{activeTeam.name}
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
				{/* sideOffset clears the fixed header; align="end" tucks it under the
				    caret. collisionPadding pins the left edge 8px in — matching the
				    settings popover's left edge (the sidebar's p-2). */}
				<PopoverContent
					align="end"
					sideOffset={20}
					collisionPadding={8}
					className="w-80 p-0"
				>
					<Command>
						<CommandInput placeholder="Find team..." />
						<CommandList>
							<CommandEmpty>No teams found.</CommandEmpty>
							<CommandGroup heading="Teams">
								{teams.map((team) => (
									<CommandItem
										key={team.id}
										value={team.name}
										onSelect={() => setOpen(false)}
										className="gap-2"
									>
										<Avatar className="size-6">
											<GeneratedAvatar seed={team.seed} className="size-full" />
										</Avatar>
										<span className="flex-1 truncate">{team.name}</span>
										{team.id === activeId && (
											<Check className="size-4 shrink-0" />
										)}
									</CommandItem>
								))}
							</CommandGroup>
							<CommandSeparator />
							<CommandGroup>
								<CommandItem disabled className="gap-2 text-muted-foreground">
									<Plus className="size-4" />
									Create team
								</CommandItem>
							</CommandGroup>
						</CommandList>
					</Command>
				</PopoverContent>
			</Popover>
		</div>
	);
}
