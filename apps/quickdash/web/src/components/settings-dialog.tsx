import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@quickengine/ui/components/ui/dialog";
import { useState } from "react";

/**
 * Workspace settings, as a dialog rather than a page.
 *
 * 🔑 Settings is somewhere you go MID-TASK — to change a prefix, add a key, fix
 * a sender address — and then carry on with what you were doing. A page throws
 * the work away and makes you navigate back to it; a dialog keeps it behind you
 * and returns you to it on close.
 *
 * 🔴 EVERY SECTION BELOW IS A STUB except the handful marked as built. This is
 * deliberate: the point of the list is to be the inventory of what a workspace
 * needs to be configurable, written down before any of it is built, so the shape
 * of the whole thing can be argued about while it is still cheap. A stub says
 * what it will hold and admits it holds nothing.
 *
 * ⚠️ Do not quietly delete a stub because it is empty. Each one is a decision
 * that something belongs in settings; removing it is a decision that it does
 * not, and that is worth saying out loud.
 */

type Section = {
	id: string;
	label: string;
	/** What this section will let somebody change. Shown in the stub. */
	blurb: string;
	/** Where it already lives, if it is built. */
	built?: string;
};

const GROUPS: Array<{ group: string; items: Section[] }> = [
	{
		group: "Workspace",
		items: [
			{
				id: "general",
				label: "General",
				blurb:
					"Name, address, time zone and the currency everything is priced in.",
			},
			{
				id: "environment",
				label: "Environment",
				blurb:
					"Whether this workspace takes real money. Locks once it has an account, an order or a payment.",
				built: "Settings page, Environment",
			},
			{
				id: "branding",
				label: "Branding",
				blurb: "Logo, colours and the look of anything a customer sees.",
				built: "Settings page, Branding",
			},
			{
				id: "domains",
				label: "Domains",
				blurb:
					"The addresses this workspace answers on, and which one is canonical.",
			},
			{
				id: "usage",
				label: "Usage",
				blurb:
					"What this workspace has consumed against its plan, and what it is costing.",
				built: "Account, Usage",
			},
			{
				id: "modules",
				label: "Modules",
				blurb: "What this workspace can do. Turn capabilities on and off.",
			},
			{
				id: "danger",
				label: "Archive & delete",
				blurb:
					"Put the workspace beyond use, or remove it and everything in it.",
			},
		],
	},
	{
		group: "Selling",
		items: [
			{
				id: "orders",
				label: "Orders",
				blurb: "Numbering, prefix, and what happens when one is placed.",
				built: "Settings page, Orders",
			},
			{
				id: "checkout",
				label: "Checkout",
				blurb:
					"What is asked for at checkout, what is optional, and where somebody lands afterwards.",
			},
			{
				id: "payments",
				label: "Payments",
				blurb:
					"Which providers can take money, which is the default, and how payouts reach you.",
			},
			{
				id: "tax",
				label: "Tax",
				blurb: "Rates, where they apply, and whether prices include them.",
			},
			{
				id: "shipping",
				label: "Shipping & delivery",
				blurb: "Zones, rates, carriers and what a customer is offered.",
			},
			{
				id: "returns",
				label: "Returns & refunds",
				blurb:
					"How long somebody has, what comes back into stock, and who approves it.",
			},
			{
				id: "inventory",
				label: "Inventory",
				blurb:
					"Whether stock is tracked, what happens at zero, and low-stock warnings.",
			},
			{
				id: "suppliers",
				label: "Suppliers",
				blurb: "Who fulfils what, and how an order reaches them.",
			},
			{
				id: "discounts",
				label: "Discounts",
				blurb: "Whether codes can stack, and what they may not apply to.",
			},
		],
	},
	{
		group: "Customers",
		items: [
			{
				id: "accounts",
				label: "Customer accounts",
				blurb:
					"Whether customers can sign in, and what they can see once they have.",
			},
			{
				id: "customer-email",
				label: "Customer email",
				blurb: "Which messages are sent, and the wording of each one.",
				built: "Partly: sender address on the Settings page",
			},
			{
				id: "reviews",
				label: "Reviews",
				blurb: "Whether reviews are moderated, and who may leave one.",
			},
		],
	},
	{
		group: "Developers",
		items: [
			{
				id: "api-keys",
				label: "API keys",
				blurb: "Server keys, what each may do, and revoking one.",
				built: "Account, Settings, API keys",
			},
			{
				id: "storefront",
				label: "Storefront keys",
				blurb:
					"Browser keys and the addresses they are allowed to be used from.",
				built: "Developers page",
			},
			{
				id: "webhooks",
				label: "Webhooks",
				blurb: "Where events are sent, signing secrets, and failed deliveries.",
			},
			{
				id: "events",
				label: "Events",
				blurb: "What this workspace emits, and what happened recently.",
			},
			{
				id: "docs",
				label: "Docs",
				blurb: "The API reference, and how to wire your own code to this.",
				built: "quickengine.xyz/docs",
			},
			{
				id: "changelog",
				label: "Changelog",
				blurb: "What has shipped, newest first.",
				built: "quickengine.xyz/changelog",
			},
		],
	},
	{
		group: "People",
		items: [
			{
				id: "members",
				label: "Members",
				blurb: "Who can reach this workspace, and inviting somebody new.",
				built: "Account, People",
			},
			{
				id: "roles",
				label: "Roles",
				blurb: "What each role may do, and defining one of your own.",
				built: "Account, Roles",
			},
			{
				id: "notifications",
				label: "Your notifications",
				blurb: "Which of this workspace's events reach you, and where.",
			},
		],
	},
	{
		group: "Data",
		items: [
			{
				id: "import",
				label: "Import",
				blurb: "Bring records in from a file or another system.",
			},
			{
				id: "export",
				label: "Export",
				blurb: "Take a copy of anything here, in a format you can open.",
			},
			{
				id: "audit",
				label: "Audit log",
				blurb: "Who changed what, and when.",
				built: "Activity page",
			},
			{
				id: "retention",
				label: "Retention",
				blurb: "How long records are kept, and what is removed automatically.",
			},
		],
	},
];

export function SettingsDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const [active, setActive] = useState("general");
	const section =
		GROUPS.flatMap((entry) => entry.items).find((item) => item.id === active) ??
		GROUPS[0].items[0];

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				showCloseButton
				className="h-[38rem] max-h-[85vh] gap-0 overflow-hidden rounded-xl border-[var(--console-line)] bg-[var(--console-pop)] p-0 text-[var(--ink-90)] shadow-2xl sm:max-w-4xl"
			>
				<DialogHeader className="sr-only">
					<DialogTitle>Workspace settings</DialogTitle>
					<DialogDescription>
						Configure this workspace without leaving the page you were on.
					</DialogDescription>
				</DialogHeader>

				<div className="flex min-h-0 flex-1">
					{/* ⚠️ The dialog's own sidebar, not the console's. It scrolls
					    independently, because the list is long by design and the content
					    beside it will be longer still. */}
					<nav className="w-52 shrink-0 overflow-y-auto border-[var(--console-line-soft)] border-r p-2">
						{GROUPS.map(({ group, items }) => (
							<div key={group} className="mb-2 flex flex-col gap-1">
								<p className="px-2 pt-2 pb-1 text-[9px] text-[var(--ink-25)] uppercase tracking-[0.14em]">
									{group}
								</p>
								{items.map((item) => (
									<button
										key={item.id}
										type="button"
										onClick={() => setActive(item.id)}
										className={`flex h-8 w-full items-center rounded-lg px-2 text-left text-[12px] transition-colors ${
											item.id === active
												? "bg-[rgb(var(--console-ink)/0.07)] text-[var(--ink-90)]"
												: "text-[var(--ink-50)] hover:bg-[rgb(var(--console-ink)/0.04)] hover:text-[var(--ink-85)]"
										}`}
									>
										<span className="min-w-0 flex-1 truncate">
											{item.label}
										</span>
										{/* 🔑 A dot marks what is NOT built, rather than a badge on
										    what is. Most of this list is unbuilt today, and marking
										    the majority is noise. */}
										{item.built ? null : (
											<span
												aria-hidden="true"
												title="Not built yet"
												className="ml-2 size-1 shrink-0 rounded-full bg-[var(--ink-20)]"
											/>
										)}
									</button>
								))}
							</div>
						))}
					</nav>

					<div className="min-w-0 flex-1 overflow-y-auto p-6">
						<h2 className="text-[15px] text-[var(--ink-90)]">
							{section.label}
						</h2>
						<p className="mt-1.5 max-w-[36rem] text-[12.5px] text-[var(--ink-45)] leading-[1.55]">
							{section.blurb}
						</p>

						<div className="mt-6 rounded-xl border border-[var(--console-line)] border-dashed px-5 py-8">
							{section.built ? (
								<>
									<p className="text-[12.5px] text-[var(--ink-70)]">
										Already built, elsewhere.
									</p>
									<p className="mt-1 text-[11.5px] text-[var(--ink-35)]">
										Lives in: {section.built}. It moves in here when this dialog
										replaces the settings page.
									</p>
								</>
							) : (
								<>
									<p className="text-[12.5px] text-[var(--ink-70)]">
										Not built yet.
									</p>
									<p className="mt-1 text-[11.5px] text-[var(--ink-35)]">
										This section is a placeholder so the shape of settings can
										be decided before any of it is written.
									</p>
								</>
							)}
						</div>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
