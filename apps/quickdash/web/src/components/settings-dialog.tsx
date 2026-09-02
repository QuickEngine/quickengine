import {
	ArrowUUpLeftIcon,
	ChartBarIcon,
	EnvelopeSimpleIcon,
	GearSixIcon,
	type Icon,
	KeyIcon,
	MagnifyingGlassIcon,
	PaletteIcon,
	PercentIcon,
	PlugsConnectedIcon,
	ShoppingCartIcon,
	SquaresFourIcon,
	StarIcon,
	TruckIcon,
	UserCircleIcon,
} from "@phosphor-icons/react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@quickengine/ui/components/ui/dialog";
import { useState } from "react";
import { SettingsSections } from "../routes/$workspace.settings";
import { ModuleIcon } from "./module-icon";
import { SaveRailProvider, useSaveRail } from "./settings/controls";
import { MODULE_SETTINGS } from "./settings/module-fields";
import { ModuleSettingsForm } from "./settings/module-settings-form";
import {
	WorkspaceApiKeys,
	WorkspaceMembers,
	WorkspaceRoles,
	WorkspaceWebhooks,
} from "./settings/workspace-access";
import { WorkspaceGeneral, WorkspaceUsage } from "./settings/workspace-basics";
import { WORKSPACE_SETTINGS } from "./settings/workspace-fields";
import {
	WorkspaceDanger,
	WorkspaceModules,
} from "./settings/workspace-modules";
import { WorkspaceSettingsForm } from "./settings/workspace-settings-form";

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

/**
 * The frame every section's content sits in.
 *
 * ⚠️ One constant rather than a class on each branch: there are nine branches
 * and they drifted apart the moment there were three — one had a max width, one
 * had none, one had a different top margin.
 */
/**
 * ⚠️ NOT a card. A settings section is a LIST — label on the left, control on
 * the right, a hairline between rows — and boxing that inside a bordered panel
 * draws a frame around a frame. The pane is the surface; the rows are the
 * content.
 */
/**
 * ⚠️ NOT a card, and NOT capped.
 *
 * A settings section is a LIST — label on the left, control on the right, a
 * hairline between rows — so boxing it draws a frame around a frame. And a
 * max-width parks every control mid-pane with dead space beyond it; the row
 * should run the width it is given, with its control at the far edge.
 */
const CARD = "";

/** One icon per page, so the rail can be scanned rather than read. */
const ICONS: Readonly<Record<string, Icon>> = {
	general: GearSixIcon,
	branding: PaletteIcon,
	usage: ChartBarIcon,
	modules: SquaresFourIcon,
	checkout: ShoppingCartIcon,
	shipping: TruckIcon,
	returns: ArrowUUpLeftIcon,
	discounts: PercentIcon,
	accounts: UserCircleIcon,
	email: EnvelopeSimpleIcon,
	reviews: StarIcon,
	"api-keys": KeyIcon,
	webhooks: PlugsConnectedIcon,
};

type Section = {
	id: string;
	label: string;
	/** What this section will let somebody change. Shown in the stub. */
	blurb: string;
	/** Where it already lives, if it is built somewhere else entirely. */
	built?: string;
	/**
	 * The id `SettingsSections` knows this by. Set it and the dialog renders the
	 * real thing rather than describing it — one implementation, shown here.
	 */
	renders?: string;
	/** Extra words the in-dialog search should match on. */
	keywords?: string;
	/**
	 * The module this page is meaningless without.
	 *
	 * 🔑 Everybody gets the same settings — what differs is which modules they
	 * bought. A service business with no Orders has no checkout, no returns and
	 * no discount codes, so those pages are not "empty for them", they do not
	 * apply. Hiding beats showing a page whose every switch governs something
	 * the workspace cannot do.
	 */
	needs?: string;
};

const GROUPS: Array<{ group: string; items: Section[] }> = [
	{
		group: "Workspace",
		items: [
			{
				id: "general",
				label: "General",
				blurb:
					"What this workspace is called, how it looks to you, and whether it takes real money.",
				keywords:
					"name theme dark light appearance environment sandbox live id api",
			},
			{
				id: "branding",
				label: "Branding & links",
				blurb:
					"How you appear to customers, where your policies live, and your social profiles.",
				keywords:
					"logo colour email sender policy privacy terms instagram social footer",
			},
			{
				id: "usage",
				label: "Usage",
				blurb: "What this account has used against its plan.",
				keywords: "plan limit quota billing storage requests",
			},
			{
				id: "modules",
				label: "Modules",
				blurb: "What this workspace can do. Turn capabilities on and off.",
				keywords: "features capabilities enable disable",
			},
		],
	},
	{
		group: "Selling",
		items: [
			{
				id: "checkout",
				label: "Checkout & tax",
				blurb:
					"What a customer has to give you, what an order has to be worth, and how tax is shown.",
				needs: "orders",
				keywords: "guest phone terms age minimum maximum vat gst duties",
			},
			{
				id: "shipping",
				label: "Shipping",
				blurb: "Where you ship from, and what a carrier is told.",
				renders: "shipping",
				needs: "shipping",
				keywords: "address parcel carrier tracking labels",
			},
			{
				id: "returns",
				label: "Returns",
				blurb:
					"How long somebody has, who pays, and what happens to the stock.",
				needs: "orders",
				keywords: "refund exchange restock rma",
			},
			{
				id: "discounts",
				label: "Discounts",
				blurb: "Whether codes can be combined, and how they are offered.",
				needs: "orders",
				keywords: "codes coupons promotions stacking",
			},
		],
	},
	{
		group: "Customers",
		items: [
			{
				id: "accounts",
				label: "Accounts & privacy",
				blurb:
					"Whether a shopper can have an account, what you keep about them, and for how long.",
				needs: "client-records",
				keywords:
					"register verify delete retention gdpr cookies consent export",
			},
			{
				id: "email",
				label: "Email & alerts",
				blurb:
					"What reaches your customers automatically, and what reaches you.",
				keywords:
					"notifications order shipped delivered review marketing summary",
			},
			{
				id: "reviews",
				label: "Reviews",
				blurb:
					"Who can leave one, and whether you see it before your customers do.",
				needs: "products-services",
				keywords: "moderation verified buyer photos rating",
			},
		],
	},
	{
		group: "Developers",
		items: [
			{
				id: "api-keys",
				label: "API keys",
				blurb: "Keys that let your own site and tools reach this workspace.",
				keywords: "secret storefront publishable token credentials revoke",
			},
			{
				id: "webhooks",
				label: "Webhooks",
				blurb: "Where events are posted, signed and retried.",
				keywords: "endpoint events signing secret deliveries retry",
			},
		],
	},
];

/**
 * The section's pinned title, and the slot its Save button lands in.
 *
 * ⚠️ A component rather than inline JSX because it calls `useSaveRail`, and a
 * hook cannot be called from inside the dialog's render branches.
 */
function SectionHeader({ label }: { label: string }) {
	const { setRail } = useSaveRail();
	return (
		<div className="sticky top-0 z-10 flex min-h-[3.5rem] items-center justify-between gap-4 border-[var(--console-line-soft)] border-b bg-[var(--console-pop)] px-6 py-3">
			<h2 className="min-w-0 truncate font-medium text-[13px] text-[var(--ink-90)]">
				{label}
			</h2>
			<div ref={setRail} className="flex shrink-0 items-center" />
		</div>
	);
}

/** A module the workspace has on that this dialog can configure. */
type ConfigurableModule = {
	id: string;
	name: string;
	/**
	 * ⚠️ `unknown`, because that is what the context type says. Each module's
	 * shape is its own and the client has no schema for it — the form reads by
	 * path and the API validates on write, which is the only place it can be
	 * checked properly anyway.
	 */
	settings?: unknown;
};

export function SettingsDialog({
	open,
	onOpenChange,
	workspaceId,
	modules = [],
	workspaceName = "",
	organizationId,
	accountUrl,
	environment = "live",
	apiUrl,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** The resolved id, not the slug — these write. */
	workspaceId: string;
	/** Straight off the workspace context, so already only the enabled ones. */
	modules?: readonly ConfigurableModule[];
	/** For the General section, which renames it. */
	workspaceName?: string;
	/** For Usage — meters are counted per ACCOUNT, not per workspace. */
	organizationId?: string | null;
	/** Where to land after archiving or deleting the workspace you are in. */
	accountUrl: string;
	environment?: "test" | "live";
	apiUrl: string;
}) {
	const [active, setActive] = useState("general");
	const [find, setFind] = useState("");

	/**
	 * 🔑 One section per module the workspace ACTUALLY HAS, built from its own
	 * settings schema rather than written out by hand here. Turning a module on
	 * adds its settings; turning it off takes them away, with no edit to this
	 * file. A hand-kept list is exactly how the onboarding catalogue drifted
	 * into offering five of fifteen modules.
	 */
	const moduleSections = modules
		.filter((module) => MODULE_SETTINGS[module.id])
		.map<Section>((module) => ({
			id: `module:${module.id}`,
			label: module.name,
			blurb: MODULE_SETTINGS[module.id].blurb,
			built: "here",
		}));

	/**
	 * ⚠️ SECOND, not last. Appending it put the only group that actually works
	 * below thirty-odd stubs, at the bottom of a scrolling list, where it was
	 * invisible without knowing to look. Built things go where they can be
	 * found; the inventory of unbuilt ones can wait underneath.
	 */
	const on = new Set(modules.map((module) => module.id));
	const applicable = GROUPS.map((entry) => ({
		...entry,
		items: entry.items.filter((item) => !item.needs || on.has(item.needs)),
	})).filter((entry) => entry.items.length > 0);

	const groups = moduleSections.length
		? [
				applicable[0],
				{ group: "Modules", items: moduleSections },
				...applicable.slice(1),
			]
		: applicable;

	/**
	 * 🔑 Searching settings, in settings.
	 *
	 * Forty-odd sections across six groups is past what anybody scans. It
	 * matches the label, the blurb and any extra keywords — so "dark" finds
	 * Appearance and "tax" finds Orders, neither of which say the word in their
	 * title.
	 *
	 * ⚠️ Groups that match nothing disappear entirely rather than sitting empty;
	 * a heading with nothing under it reads as something failing to load.
	 */
	const needle = find.trim().toLowerCase();
	const found = needle
		? groups
				.map((entry) => ({
					...entry,
					items: entry.items.filter((item) =>
						`${item.label} ${item.blurb} ${item.keywords ?? ""}`
							.toLowerCase()
							.includes(needle),
					),
				}))
				.filter((entry) => entry.items.length > 0)
		: groups;

	const section =
		groups.flatMap((entry) => entry.items).find((item) => item.id === active) ??
		groups[0].items[0];
	const openModule = section.id.startsWith("module:")
		? modules.find((module) => module.id === section.id.slice(7))
		: undefined;

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
					<div className="flex w-52 shrink-0 flex-col border-[var(--console-line-soft)] border-r bg-[var(--pop-rail)]">
						<label className="m-2 flex h-8 shrink-0 items-center gap-2 rounded-md border border-[var(--console-line)] bg-[var(--console-pop)] px-2">
							<MagnifyingGlassIcon
								size={13}
								aria-hidden="true"
								className="shrink-0 text-[var(--ink-30)]"
							/>
							<span className="sr-only">Search settings</span>
							<input
								value={find}
								onChange={(event) => setFind(event.target.value)}
								placeholder="Search settings"
								className="min-w-0 flex-1 bg-transparent text-[12px] text-[var(--ink-85)] outline-none placeholder:text-[var(--ink-30)]"
							/>
						</label>
						<nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
							{found.map(({ group, items }) => (
								<div key={group} className="mb-2 flex flex-col gap-1">
									<p className="px-2 pt-2 pb-1 text-[9px] text-[var(--ink-25)] uppercase tracking-[0.14em]">
										{group}
									</p>
									{items.map((item) => {
										/* A module section is named by its module, so it takes the
										   module's own icon rather than a second generic one. */
										const RailIcon = ICONS[item.id];
										const moduleId = item.id.startsWith("module:")
											? item.id.slice(7)
											: null;
										return (
											<button
												key={item.id}
												type="button"
												onClick={() => setActive(item.id)}
												className={`flex h-8 w-full items-center gap-2.5 rounded-lg px-2 text-left text-[12px] transition-colors ${
													item.id === active
														? "bg-[rgb(var(--console-ink)/0.07)] text-[var(--ink-90)]"
														: "text-[var(--ink-50)] hover:bg-[rgb(var(--console-ink)/0.04)] hover:text-[var(--ink-85)]"
												}`}
											>
												{moduleId ? (
													<ModuleIcon
														id={moduleId}
														className="size-[14px] shrink-0 opacity-70"
													/>
												) : RailIcon ? (
													<RailIcon size={14} className="shrink-0 opacity-70" />
												) : (
													<span className="size-[14px] shrink-0" />
												)}
												<span className="min-w-0 flex-1 truncate">
													{item.label}
												</span>
											</button>
										);
									})}
								</div>
							))}
							{found.length === 0 ? (
								<p className="px-2 py-3 text-[11px] text-[var(--ink-30)] leading-4">
									Nothing in settings matches that.
								</p>
							) : null}
						</nav>
					</div>

					{/*
					 * 🔑 The pane, not the rail, carries the working surface — and the
					 * heading stays put while the section scrolls under it. Sections
					 * run long (Checkout has seven fields, Modules sixteen rows), and
					 * a title that scrolls away leaves you reading switches with no
					 * idea which section you are in.
					 */}
					<SaveRailProvider>
						<div className="min-w-0 flex-1 overflow-y-auto bg-[var(--console-pop)]">
							<SectionHeader label={section.label} />
							<div className="p-6">
								{openModule ||
								WORKSPACE_SETTINGS[section.id] ||
								["api-keys", "webhooks", "members", "roles"].includes(
									section.id,
								) ||
								section.renders ||
								section.id === "general" ||
								section.id === "usage" ||
								section.id === "modules" ||
								section.id === "danger" ? null : (
									<p className="mt-1.5 max-w-[36rem] text-[12.5px] text-[var(--ink-45)] leading-[1.55]">
										{section.blurb}
									</p>
								)}

								{section.id === "branding" ? (
									/* 🔑 Two sources, one page. The branding form is the same
							   implementation the settings page renders; the policy and
							   social links are workspace settings groups. Both are "how a
							   customer finds and recognises you", so they belong on one
							   page even though they are stored in different places. */
									<div className={`${CARD} flex flex-col gap-8`}>
										<div className="[&_p.mt-9]:mt-0">
											<SettingsSections
												workspaceId={workspaceId}
												only="branding"
											/>
										</div>
										<WorkspaceSettingsForm
											workspaceId={workspaceId}
											section="branding"
										/>
									</div>
								) : section.id === "api-keys" ? (
									<div className={CARD}>
										<WorkspaceApiKeys
											workspaceId={workspaceId}
											organizationId={organizationId}
										/>
									</div>
								) : section.id === "webhooks" ? (
									<div className={CARD}>
										<WorkspaceWebhooks workspaceId={workspaceId} />
									</div>
								) : section.id === "members" ? (
									<div className={CARD}>
										<WorkspaceMembers organizationId={organizationId} />
									</div>
								) : section.id === "roles" ? (
									<div className={CARD}>
										<WorkspaceRoles organizationId={organizationId} />
									</div>
								) : WORKSPACE_SETTINGS[section.id] ? (
									<div className={CARD}>
										<WorkspaceSettingsForm
											workspaceId={workspaceId}
											section={section.id}
										/>
									</div>
								) : section.id === "modules" ? (
									<div className={CARD}>
										<WorkspaceModules
											workspaceId={workspaceId}
											organizationId={organizationId}
										/>
									</div>
								) : section.id === "danger" ? (
									<div className={CARD}>
										<WorkspaceDanger
											workspaceId={workspaceId}
											name={workspaceName}
											accountUrl={accountUrl}
											organizationId={organizationId}
										/>
									</div>
								) : section.id === "general" ? (
									<div className={CARD}>
										<WorkspaceGeneral
											workspaceId={workspaceId}
											name={workspaceName}
											organizationId={organizationId}
											environment={environment}
											apiUrl={apiUrl}
										/>
									</div>
								) : section.id === "usage" ? (
									<div className={CARD}>
										<WorkspaceUsage organizationId={organizationId} />
									</div>
								) : section.renders ? (
									/* 🔑 The real implementation, not a copy of it. One branding
							   form, one email template editor, one environment switch —
							   rendered here and on the settings page from the same file. */
									/* ⚠️ `mt-9` is the gap BETWEEN sections on the page, where they
							   stack. Shown one at a time there is nothing above to be
							   spaced from, so the first heading is pulled back up. */
									<div className={`${CARD} [&_p.mt-9]:mt-0`}>
										<SettingsSections
											workspaceId={workspaceId}
											only={section.renders}
										/>
									</div>
								) : openModule ? (
									<div className={CARD}>
										<ModuleSettingsForm
											workspaceId={workspaceId}
											moduleId={openModule.id}
											moduleName={openModule.name}
											settings={
												(openModule.settings as Record<string, unknown>) ?? {}
											}
										/>
									</div>
								) : (
									<div className={`${CARD} border-dashed`}>
										{section.built ? (
											<>
												<p className="text-[12.5px] text-[var(--ink-70)]">
													Already built, elsewhere.
												</p>
												<p className="mt-1 text-[11.5px] text-[var(--ink-35)]">
													Lives in: {section.built}. It moves in here when this
													dialog replaces the settings page.
												</p>
											</>
										) : (
											<>
												<p className="text-[12.5px] text-[var(--ink-70)]">
													Not built yet.
												</p>
												<p className="mt-1 text-[11.5px] text-[var(--ink-35)]">
													This section is a placeholder so the shape of settings
													can be decided before any of it is written.
												</p>
											</>
										)}
									</div>
								)}
							</div>
						</div>
					</SaveRailProvider>
				</div>
			</DialogContent>
		</Dialog>
	);
}
