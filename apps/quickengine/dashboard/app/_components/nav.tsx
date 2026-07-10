"use client";

import {
	ChartLine,
	CurrencyDollar,
	Gauge,
	Gear,
	type Icon,
	Pulse,
	PuzzlePiece,
	SquaresFour,
	UsersThree,
} from "@phosphor-icons/react";
import {
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@quickengine/ui/components/ui/sidebar";
import { usePathname } from "next/navigation";
import { SettingsDialog } from "./settings-dialog";

// Subtle container on hover so buttons read as clickable; a stronger neutral gray
// when active (current route). Overrides the shadcn default's tinted (blue-ish)
// sidebar-accent backgrounds.
const navButton =
	"hover:bg-foreground/5 active:bg-foreground/5 data-[active=true]:bg-foreground/10 data-[active=true]:text-foreground";

type NavItem = { href: string; label: string; icon: Icon };

const mainNav: NavItem[] = [
	{ href: "/", label: "Dashboard", icon: Gauge },
	{ href: "/workspaces", label: "Workspaces", icon: SquaresFour },
	{ href: "/revenue", label: "Revenue", icon: CurrencyDollar },
	{ href: "/analytics", label: "Analytics", icon: ChartLine },
	{ href: "/team", label: "Team", icon: UsersThree },
	{ href: "/integrations", label: "Integrations", icon: PuzzlePiece },
	{ href: "/activity", label: "Activity", icon: Pulse },
];

function isActive(pathname: string, href: string): boolean {
	return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function NavList({ items, pathname }: { items: NavItem[]; pathname: string }) {
	return (
		<SidebarMenu>
			{items.map(({ href, label, icon: IconComponent }) => (
				<SidebarMenuItem key={href}>
					<SidebarMenuButton
						asChild
						isActive={isActive(pathname, href)}
						className={navButton}
					>
						<a href={href}>
							<IconComponent />
							<span>{label}</span>
						</a>
					</SidebarMenuButton>
				</SidebarMenuItem>
			))}
		</SidebarMenu>
	);
}

// Account-console sidebar nav: control-center items up top, a single Settings
// button (opening the settings dialog) pinned to the bottom.
export function DashboardNav() {
	const pathname = usePathname();

	return (
		<>
			<SidebarContent>
				{/* px-3 (vs the default p-2's 8px) gives the buttons a bit more
				    breathing room on the left/right edges of the sidebar. */}
				<SidebarGroup className="px-3">
					<NavList items={mainNav} pathname={pathname} />
				</SidebarGroup>
			</SidebarContent>
			{/* Dedicated footer: same height as the header and the same divider (a top
			    border matching the header's bottom border). px-2 matches the nav
			    group's inset so the Settings button is the exact same width as the
			    items above; justify-center vertically centers it in the taller bar. */}
			<SidebarFooter className="h-(--header-height) justify-center border-sidebar-border border-t px-3 py-0">
				<SidebarMenu>
					<SidebarMenuItem>
						<SettingsDialog>
							<SidebarMenuButton className={navButton}>
								<Gear />
								<span>Settings</span>
							</SidebarMenuButton>
						</SettingsDialog>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarFooter>
		</>
	);
}
