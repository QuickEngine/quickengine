import {
	AddressBookIcon,
	ArticleIcon,
	CalendarBlankIcon,
	FilesIcon,
	type Icon,
	InvoiceIcon,
	PackageIcon,
	PenNibIcon,
	PercentIcon,
	PlusIcon,
	StorefrontIcon,
	TruckIcon,
} from "@phosphor-icons/react";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@quickengine/ui/components/ui/popover";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

/**
 * The one place to start something new, wherever you are.
 *
 * 🔑 It lists what this workspace can actually do. Every entry names the module
 * it needs, and one that is switched off is not shown — offering "New invoice"
 * to a workspace without invoicing is an advert for a locked door, and the page
 * behind it would refuse anyway.
 *
 * ⚠️ These NAVIGATE, they do not create. Each page owns its own create panel,
 * with its own required fields and its own validation; a menu that made records
 * directly would be a second, thinner version of every one of those forms, and
 * the two would drift.
 */

type QuickAction = {
	/** The module that must be on for this to appear. */
	module: string;
	label: string;
	Icon: Icon;
	/** The sub-page, when the thing lives inside a module rather than on it. */
	section?: string;
};

const ACTIONS: readonly QuickAction[] = [
	{ module: "products-services", label: "Product", Icon: StorefrontIcon },
	{ module: "client-records", label: "Customer", Icon: AddressBookIcon },
	{ module: "invoicing", label: "Invoice", Icon: InvoiceIcon },
	{ module: "quotes-estimates", label: "Quote", Icon: PackageIcon },
	{ module: "bookings", label: "Booking", Icon: CalendarBlankIcon },
	{
		module: "orders",
		section: "discounts",
		label: "Discount",
		Icon: PercentIcon,
	},
	{
		module: "inventory",
		section: "suppliers",
		label: "Supplier",
		Icon: PackageIcon,
	},
	{
		module: "shipping",
		section: "zones",
		label: "Shipping zone",
		Icon: TruckIcon,
	},
	{ module: "contracts-esign", label: "Contract", Icon: PenNibIcon },
	{ module: "content", label: "Page content", Icon: ArticleIcon },
	{ module: "files", label: "File", Icon: FilesIcon },
];

export function QuickActions({
	workspace,
	modules,
}: {
	/** The URL slug, not the id — these build links. */
	workspace: string;
	modules: ReadonlyArray<{ id: string }>;
}) {
	const [open, setOpen] = useState(false);
	const on = new Set(modules.map((module) => module.id));
	const available = ACTIONS.filter((action) => on.has(action.module));

	// Nothing to start means no button. A menu that opens onto an apology is
	// worse than a control that is not there.
	if (available.length === 0) return null;

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger
				aria-label="Create"
				title="Create"
				className="flex size-9 shrink-0 items-center justify-center rounded-md border border-[var(--console-line)] bg-[var(--console-panel)] text-[var(--ink-40)] transition-colors duration-150 hover:text-[var(--ink-90)] active:translate-y-px data-[state=open]:text-[var(--ink-90)]"
			>
				<PlusIcon size={15} weight="bold" />
			</PopoverTrigger>
			<PopoverContent
				align="start"
				sideOffset={8}
				className="w-56 rounded-2xl border border-[var(--console-line-strong)] bg-[var(--console-pop)] p-1.5"
			>
				<p className="px-2 pt-1 pb-1.5 text-[10.5px] text-[var(--ink-30)] uppercase tracking-[0.08em]">
					Create
				</p>
				{available.map((action) => (
					<Link
						key={`${action.module}/${action.section ?? ""}`}
						to={
							action.section
								? "/$workspace/$module/$section"
								: "/$workspace/$module"
						}
						params={{
							workspace,
							module: action.module,
							...(action.section ? { section: action.section } : {}),
						}}
						onClick={() => setOpen(false)}
						className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[12.5px] text-[var(--ink-70)] no-underline transition-colors hover:bg-[rgb(var(--console-ink)/0.06)] hover:text-[var(--ink-90)]"
					>
						<action.Icon size={15} className="shrink-0 text-[var(--ink-40)]" />
						{action.label}
					</Link>
				))}
			</PopoverContent>
		</Popover>
	);
}
