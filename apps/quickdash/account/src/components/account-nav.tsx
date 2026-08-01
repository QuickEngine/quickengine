import {
	BuildingsIcon,
	type Icon,
	PulseIcon,
	PuzzlePieceIcon,
	SquaresFourIcon,
	UsersThreeIcon,
} from "@phosphor-icons/react";
import { Link, useRouterState } from "@tanstack/react-router";

const row =
	"inline-flex h-8 w-full items-center gap-2.5 rounded-md px-2 font-body text-[13px] transition-colors";
const idle = "text-dim hover:bg-field hover:text-ink";
const active = "bg-field text-ink";

function SectionLabel({ children }: { children: string }) {
	return (
		<p className="px-2 pt-4 pb-1 font-body text-[10px] text-dim/70 uppercase tracking-[0.12em]">
			{children}
		</p>
	);
}

/**
 * Pinned above the scroll region, mirroring QuickDash's rail.
 *
 * Workspaces is the control plane's equivalent of Dashboard — it is what you
 * came here for, and it is where you leave for the product.
 */
const PINNED: { href: string; label: string; icon: Icon }[] = [
	{ href: "/", label: "Workspaces", icon: SquaresFourIcon },
	{ href: "/overview", label: "Overview", icon: BuildingsIcon },
];

/** The rest of the organisation surface. */
const ORGANISATION: { href: string; label: string; icon: Icon }[] = [
	{ href: "/team", label: "Team", icon: UsersThreeIcon },
	{ href: "/integrations", label: "Products", icon: PuzzlePieceIcon },
	{ href: "/activity", label: "Activity", icon: PulseIcon },
];

const isActive = (pathname: string, href: string) =>
	href === "/" ? pathname === "/" : pathname.startsWith(href);

export function AccountNavTop() {
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	return (
		<div className="flex flex-col gap-1 px-2 pt-2">
			{PINNED.map(({ href, label, icon: Glyph }) => (
				<Link
					key={href}
					to={href}
					className={`${row} ${isActive(pathname, href) ? active : idle}`}
				>
					<Glyph size={16} className="shrink-0" />
					<span className="truncate">{label}</span>
				</Link>
			))}
		</div>
	);
}

export function AccountNav() {
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	return (
		<nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 pt-2 pb-2">
			<SectionLabel>Organisation</SectionLabel>
			{ORGANISATION.map(({ href, label, icon: Glyph }) => (
				<Link
					key={href}
					to={href}
					className={`${row} ${isActive(pathname, href) ? active : idle}`}
				>
					<Glyph size={16} className="shrink-0" />
					<span className="truncate">{label}</span>
				</Link>
			))}
		</nav>
	);
}
