import {
	AppWindowIcon,
	CaretRightIcon,
	ChartPieSliceIcon,
	CreditCardIcon,
	type Icon,
	LockKeyIcon,
	PlugIcon,
	PulseIcon,
	ShieldCheckIcon,
	UsersThreeIcon,
} from "@phosphor-icons/react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useState } from "react";

type Child = { label: string; href: string };
type Item = {
	label: string;
	href?: string;
	icon: Icon;
	children?: Child[];
};

const MAIN: Item[] = [
	{ label: "Overview", href: "/", icon: ChartPieSliceIcon },
	{
		label: "Workspaces",
		icon: AppWindowIcon,
		href: "/workspaces",
	},
];

const MANAGE: Item[] = [
	{
		label: "People",
		icon: UsersThreeIcon,
		children: [
			{ label: "Members", href: "/team" },
			{ label: "Invitations", href: "/team/invitations" },
		],
	},
	{ label: "Roles", href: "/roles", icon: ShieldCheckIcon },
	{ label: "Integrations", href: "/integrations", icon: PlugIcon },
	{
		label: "Billing",
		icon: CreditCardIcon,
		children: [
			{ label: "Plan", href: "/billing" },
			{ label: "Credits & spend", href: "/billing/credits" },
		],
	},
	{
		label: "Activity",
		icon: PulseIcon,
		children: [
			{ label: "Audit log", href: "/activity" },
			{ label: "Notifications", href: "/activity/notifications" },
		],
	},
];

const ORGANIZATION: Item[] = [
	{
		label: "Security",
		icon: LockKeyIcon,
		children: [
			{ label: "Authentication", href: "/settings/security" },
			{ label: "Sessions", href: "/settings/sessions" },
			{ label: "API keys", href: "/settings/api-keys" },
		],
	},
];

const row =
	"group flex h-8 w-full shrink-0 items-center gap-2.5 rounded-md px-2 text-[12.5px] outline-none transition-colors";
const idle =
	"text-[var(--ink-42)] hover:bg-[rgb(var(--console-ink)/0.055)] hover:text-[var(--ink-85)]";
const active = "bg-[rgb(var(--console-ink)/0.07)] text-[var(--ink-90)]";

/**
 * Whether a nav target is the page you are on.
 *
 * Every child is its own route now, so this is a path comparison and nothing
 * else. Exact match for a parent that also has children (`/team` must not light
 * up while you are on `/team/invitations`), prefix match otherwise so a detail
 * page keeps its section lit.
 */
const current = (locationHref: string, href: string, exact = false) => {
	const path = locationHref.split("#")[0].split("?")[0];
	if (exact || href === "/") return path === href;
	return path === href || path.startsWith(`${href}/`);
};

function SectionLabel({ children }: { children: string }) {
	return (
		<p className="shrink-0 px-2 pt-4 pb-1.5 text-[8.5px] text-[var(--ink-20)] uppercase tracking-[0.14em]">
			{children}
		</p>
	);
}

function NavItem({ item, pathname }: { item: Item; pathname: string }) {
	const children = item.children;
	const childActive = children?.some((child, index) =>
		// The first child owns the parent's own path, so it matches exactly —
		// otherwise `/team` would light up while you are on `/team/invitations`.
		current(pathname, child.href, index === 0 && children.length > 1),
	);
	const [open, setOpen] = useState(Boolean(childActive));
	const Glyph = item.icon;

	if (item.children) {
		return (
			<div className="shrink-0">
				<button
					type="button"
					onClick={() => setOpen((value) => !value)}
					aria-expanded={open}
					className={`${row} ${childActive ? active : idle}`}
				>
					<Glyph size={15} className="shrink-0" />
					<span className="min-w-0 flex-1 truncate text-left">
						{item.label}
					</span>
					<CaretRightIcon
						size={11}
						className={`shrink-0 text-[var(--ink-25)] transition-transform ${open ? "rotate-90" : ""}`}
					/>
				</button>
				{open ? (
					<div className="my-1 flex shrink-0 flex-col gap-1">
						{item.children.map((child, index) => {
							// 🔴 A router link, never an anchor — an anchor is a full document
							// navigation, which is what made the whole sidebar reload and flash
							// every time one was clicked.
							return (
								<Link
									key={child.href}
									to={child.href}
									className={`flex h-8 w-full shrink-0 items-center rounded-md pr-2 pl-[2.15rem] text-[11.5px] transition-colors ${current(pathname, child.href, index === 0) ? "bg-[rgb(var(--console-ink)/0.07)] text-[var(--ink-85)]" : "text-[var(--ink-32)] hover:bg-[rgb(var(--console-ink)/0.045)] hover:text-[var(--ink-75)]"}`}
								>
									{child.label}
								</Link>
							);
						})}
					</div>
				) : null}
			</div>
		);
	}

	return (
		<Link
			to={item.href ?? "/"}
			className={`${row} ${current(pathname, item.href ?? "/") ? active : idle}`}
		>
			<Glyph size={15} className="shrink-0" />
			<span className="truncate">{item.label}</span>
		</Link>
	);
}

export function AccountNav() {
	const pathname = useRouterState({ select: (state) => state.location.href });
	const [scrolled, setScrolled] = useState(false);

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<nav
				className={`flex shrink-0 flex-col gap-1 border-b px-2 pb-1 transition-colors ${scrolled ? "border-[var(--console-line-soft)]" : "border-transparent"}`}
			>
				{MAIN.map((item) => (
					<NavItem key={item.label} item={item} pathname={pathname} />
				))}
			</nav>
			<nav
				onScroll={(event) => setScrolled(event.currentTarget.scrollTop > 0)}
				className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 py-2"
			>
				<SectionLabel>Manage</SectionLabel>
				{MANAGE.map((item) => (
					<NavItem key={item.label} item={item} pathname={pathname} />
				))}
				<SectionLabel>Organization</SectionLabel>
				{ORGANIZATION.map((item) => (
					<NavItem key={item.label} item={item} pathname={pathname} />
				))}
			</nav>
		</div>
	);
}
