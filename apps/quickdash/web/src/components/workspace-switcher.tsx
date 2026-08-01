import { CaretUpDownIcon, CheckIcon, PlusIcon } from "@phosphor-icons/react";
import { GeneratedAvatar } from "@quickengine/ui";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@quickengine/ui/components/ui/command";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@quickengine/ui/components/ui/popover";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { clientEnv } from "../lib/env";
import type { QuickDashWorkspace } from "../lib/quickdash-api";

/**
 * Workspace switching, from the header.
 *
 * Lives here rather than only in Account because switching is a *working*
 * action — Account manages workspaces, QuickDash works in one, and an operator
 * running two shops switches several times a day.
 *
 * The whole chip is the trigger, not just the caret. A control that looks like
 * one button should behave like one; splitting it would mean the name does
 * nothing and only the 12px arrow is clickable.
 */
export function WorkspaceSwitcher({
	active,
	workspaces,
	organizationId,
	planId,
}: {
	active: QuickDashWorkspace;
	workspaces: QuickDashWorkspace[];
	organizationId: string | null;
	planId: string | null;
}) {
	const [open, setOpen] = useState(false);
	const navigate = useNavigate();
	const avatarSeed = organizationId
		? `account:${organizationId}`
		: `workspace:${active.id}`;

	return (
		<div
			data-orientation-target="workspace-switcher"
			className="flex w-full items-center gap-2"
		>
			<span className="size-6 shrink-0 overflow-hidden rounded-full ring-1 ring-edge">
				<GeneratedAvatar seed={avatarSeed} className="size-full" />
			</span>

			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger className="btn btn-secondary pointer-events-auto inline-flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-lg bg-void px-2.5 text-ink outline-none">
					<span className="truncate font-body text-[13px]">{active.name}</span>

					{/* 🔴 TEMPORARY FALLBACK — remove before this ships. The real plan
					    comes from `/account/plan`; a hardcoded tier is a claim about what
					    someone pays for. */}
					<span className="shrink-0 rounded-full bg-field px-2 py-0.5 font-body text-[10px] text-dim capitalize">
						{planId ?? "Free"}
					</span>

					<CaretUpDownIcon size={12} className="ml-auto shrink-0 text-dim" />
				</PopoverTrigger>

				<PopoverContent
					align="start"
					alignOffset={-32}
					sideOffset={8}
					className="w-72 p-0 [&_[data-slot=command-input-wrapper]]:border-0"
				>
					<Command className="bg-transparent">
						<CommandInput placeholder="Find workspace…" />
						<CommandList className="flex flex-col gap-1 px-1 pb-2 [&_[cmdk-group-items]]:flex [&_[cmdk-group-items]]:flex-col [&_[cmdk-group-items]]:gap-1">
							<CommandEmpty className="py-6 text-center text-[13px] text-dim">
								No workspaces found.
							</CommandEmpty>

							<CommandGroup heading="Workspaces" className="px-1">
								{workspaces.map((workspace) => (
									<CommandItem
										key={workspace.id}
										value={`${workspace.name} ${workspace.slug ?? ""}`}
										onSelect={() => {
											setOpen(false);
											void navigate({
												to: "/$workspace",
												params: { workspace: workspace.id },
											});
										}}
										className="h-8 gap-2 rounded-md px-2 py-0 text-[13px]"
									>
										<span className="size-5 shrink-0 overflow-hidden rounded-full">
											<GeneratedAvatar
												seed={`workspace:${workspace.id}`}
												className="size-full"
											/>
										</span>
										<span className="flex-1 truncate">{workspace.name}</span>
										{workspace.id === active.id ? (
											<CheckIcon size={13} className="shrink-0 text-dim" />
										) : null}
									</CommandItem>
								))}
							</CommandGroup>

							{/* Creating one is an account operation, so it leaves for the
							    account app rather than pretending to happen here. */}
							<CommandGroup className="px-1">
								<CommandItem
									onSelect={() => {
										window.location.href = `${clientEnv.ACCOUNT_URL}/workspaces/new`;
									}}
									className="h-8 gap-2 rounded-md px-2 py-0 text-[13px] text-dim"
								>
									<PlusIcon size={14} className="shrink-0" />
									Create workspace
								</CommandItem>
							</CommandGroup>
						</CommandList>
					</Command>
				</PopoverContent>
			</Popover>
		</div>
	);
}
