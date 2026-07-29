import {
	Gauge,
	type Icon,
	Pulse,
	PuzzlePiece,
	SquaresFour,
	UsersThree,
} from "@phosphor-icons/react";

export type AccountNavItem = { href: string; label: string; icon: Icon };

export const ACCOUNT_NAV_ITEMS: AccountNavItem[] = [
	{ href: "/", label: "Workspaces", icon: SquaresFour },
	{ href: "/overview", label: "Overview", icon: Gauge },
	{ href: "/team", label: "Team", icon: UsersThree },
	{ href: "/integrations", label: "Products", icon: PuzzlePiece },
	{ href: "/activity", label: "Activity", icon: Pulse },
];
