import {
	ArrowSquareOutIcon,
	type Icon,
	IdentificationCardIcon,
	PlugsIcon,
	SquaresFourIcon,
} from "@phosphor-icons/react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
	DialogTrigger,
} from "@quickengine/ui/components/ui/dialog";
import { useState } from "react";
import { clientEnv } from "../lib/env";
import { MODULE_LABELS } from "./sidebar-nav";

/**
 * Developers — a dialog with its own rail.
 *
 * Renamed from "Workspace settings" on 2026-07-31. Every real workspace setting
 * lives in Account, so two things called Settings meant different things in two
 * places. What is actually unique to QuickDash is the developer surface: keys,
 * webhooks, the SDK. General and Modules stay as reference, because you need the
 * workspace identity and its enabled modules to work against the API.
 *
 * ⚠️ Read-only, and that is architectural rather than unfinished. Renaming a
 * workspace, enabling a module, managing members and archiving are all
 * **account-boundary** operations: QuickDash reads workspace state, the Account
 * app owns changing it. Writing them from here would mean either duplicating
 * those endpoints or letting a workspace-scoped credential mutate account state,
 * and that second one is a security boundary that exists on purpose.
 *
 * So each section shows what is true and hands off for what changes it.
 */

type SectionId = "general" | "modules" | "connect";

const SECTIONS: { id: SectionId; label: string; icon: Icon }[] = [
	{ id: "connect", label: "Connect", icon: PlugsIcon },
	{ id: "modules", label: "Modules", icon: SquaresFourIcon },
	{ id: "general", label: "Workspace", icon: IdentificationCardIcon },
];

export function WorkspaceDevelopers({
	workspaceId,
	workspaceSlug,
	workspaceName,
	businessType,
	moduleIds,
	trigger,
}: {
	workspaceId: string;
	workspaceSlug: string | null;
	workspaceName: string;
	businessType: string;
	moduleIds: string[];
	trigger: React.ReactNode;
}) {
	// Connect first: it is the reason this dialog is called Developers.
	const [section, setSection] = useState<SectionId>("connect");
	const accountHref = `${clientEnv.ACCOUNT_URL}/workspaces/${workspaceSlug ?? ""}`;

	const outLink =
		"inline-flex w-fit items-center gap-1.5 font-body text-[12px] text-dim transition-colors hover:text-ink";
	const heading = "font-body font-[450] text-[13px] text-ink";
	const body = "font-body text-[12px] text-dim leading-relaxed";

	return (
		<Dialog>
			<DialogTrigger asChild>{trigger}</DialogTrigger>
			{/* `p-0 gap-0` because the rail has to reach the dialog's own edges — the
			    default padding would float it in the middle of the panel. */}
			<DialogContent className="h-[min(88vh,52rem)] w-[min(92vw,60rem)] gap-0 overflow-hidden p-0 sm:max-w-[min(92vw,60rem)]">
				<DialogTitle className="sr-only">Developers</DialogTitle>
				<DialogDescription className="sr-only">
					Settings for {workspaceName}
				</DialogDescription>

				<div className="flex h-full">
					{/* The rail. `bg-void` against the dialog's `bg-field` mirrors the
					    app's own rail-and-panel relationship, so this reads as a small
					    version of the thing it opened from rather than a new pattern. */}
					<nav className="flex w-56 shrink-0 flex-col gap-1 bg-void p-2">
						<p className="px-2 pt-2 pb-1 font-body text-[10px] text-dim/70 uppercase tracking-[0.12em]">
							Developers
						</p>
						{SECTIONS.map(({ id, label, icon: Glyph }) => (
							<button
								key={id}
								type="button"
								onClick={() => setSection(id)}
								className={`inline-flex h-8 items-center gap-2.5 rounded-md px-2 font-body text-[13px] transition-colors ${
									section === id
										? "bg-field text-ink"
										: "text-dim hover:bg-field hover:text-ink"
								}`}
							>
								<Glyph size={15} className="shrink-0" />
								{label}
							</button>
						))}
					</nav>

					<div className="min-w-0 flex-1 overflow-y-auto p-8">
						{section === "general" ? (
							<div className="flex flex-col gap-5">
								<div className="flex flex-col gap-1">
									<h3 className={heading}>Name</h3>
									<p className={body}>{workspaceName}</p>
								</div>
								<div className="flex flex-col gap-1">
									<h3 className={heading}>Business type</h3>
									<p className={`${body} capitalize`}>
										{businessType.replace(/-/g, " ")}
									</p>
								</div>
								<div className="flex flex-col gap-2">
									<h3 className={heading}>Manage</h3>
									<p className={body}>
										Renaming, members and deletion are handled in your account.
									</p>
									<a href={accountHref} className={outLink}>
										Open in Account
										<ArrowSquareOutIcon size={12} />
									</a>
								</div>
							</div>
						) : null}

						{section === "modules" ? (
							<div className="flex flex-col gap-3">
								<div className="flex items-baseline justify-between gap-3">
									<h3 className={heading}>Enabled modules</h3>
									<span className="font-body text-[12px] text-dim">
										{moduleIds.length}
									</span>
								</div>
								{/* A list, not toggles. A switch would imply this can turn one
								    off, and it cannot — that is an account operation. */}
								<ul className="flex flex-col gap-1">
									{moduleIds.map((id) => (
										<li key={id} className={body}>
											{MODULE_LABELS[id] ?? id}
										</li>
									))}
								</ul>
								<a href={accountHref} className={`${outLink} mt-1`}>
									Change enabled modules
									<ArrowSquareOutIcon size={12} />
								</a>
							</div>
						) : null}

						{section === "connect" ? (
							<div className="flex flex-col gap-3">
								<h3 className={heading}>Developer access</h3>
								<p className={body}>
									API keys, webhooks and the SDK quickstart for this workspace.
								</p>
								<a
									href={`/${workspaceId}/connect`}
									className={`${outLink} mt-1`}
								>
									Open Connect
								</a>
							</div>
						) : null}
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
