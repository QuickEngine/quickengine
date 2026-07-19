"use client";

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
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { QuickDashWorkspace } from "../_lib/workspace-access";

const ACCOUNT_URL =
	process.env.NEXT_PUBLIC_QUICKENGINE_ACCOUNT_URL ?? "http://localhost:3001";

export function WorkspaceSwitcher({
	active,
	workspaces,
	organizationId,
}: {
	active: QuickDashWorkspace;
	workspaces: QuickDashWorkspace[];
	organizationId: string | null;
}) {
	const [open, setOpen] = useState(false);
	const router = useRouter();

	// Org avatar — seeded by org id in the SAME format as QuickEngine's account switcher, so
	// it's identical across apps and persistent across a workspace switch. Legacy workspaces
	// with no org fall back to a stable per-workspace seed.
	const avatarSeed = organizationId
		? `account:${organizationId}`
		: `workspace:${active.id}`;

	return (
		<div className="flex w-full items-center gap-2">
			<Avatar className="size-8 shrink-0">
				<GeneratedAvatar seed={avatarSeed} className="size-full" />
			</Avatar>
			<span className="min-w-0 flex-1 truncate font-normal text-[15px]">
				{active.name}
			</span>
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger
					aria-label="Switch workspace"
					className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-foreground/40"
				>
					<CaretUpDown className="size-5" />
				</PopoverTrigger>
				<PopoverContent align="end" sideOffset={20} className="w-80 p-0">
					<Command>
						<CommandInput placeholder="Find workspace..." />
						<CommandList>
							<CommandEmpty>No workspaces found.</CommandEmpty>
							<CommandGroup heading="Workspaces">
								{workspaces.map((workspace) => (
									<CommandItem
										key={workspace.id}
										value={`${workspace.name} ${workspace.slug ?? ""}`}
										onSelect={() => {
											setOpen(false);
											router.push(`/${workspace.id}`);
										}}
										className="gap-2"
									>
										<Avatar className="size-6">
											<GeneratedAvatar
												seed={`workspace:${workspace.id}`}
												className="size-full"
											/>
										</Avatar>
										<span className="flex-1 truncate">{workspace.name}</span>
										{workspace.id === active.id ? <Check /> : null}
									</CommandItem>
								))}
							</CommandGroup>
							<CommandSeparator />
							<CommandGroup>
								<CommandItem
									onSelect={() => {
										window.location.href = `${ACCOUNT_URL}/workspaces/new`;
									}}
									className="gap-2"
								>
									<Plus />
									Create workspace in QuickEngine
								</CommandItem>
							</CommandGroup>
						</CommandList>
					</Command>
				</PopoverContent>
			</Popover>
		</div>
	);
}
