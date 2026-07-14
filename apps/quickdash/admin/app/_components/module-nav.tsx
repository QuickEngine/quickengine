"use client";

import { ArrowLeft, Gear, House } from "@phosphor-icons/react";
import {
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@quickengine/ui/components/ui/sidebar";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ModuleNavigationItem } from "../_lib/module-navigation";
import { ModuleIcon } from "./module-icon";

const ACCOUNT_URL =
	process.env.NEXT_PUBLIC_QUICKENGINE_ACCOUNT_URL ?? "http://localhost:3001";
const navButton =
	"hover:bg-foreground/5 active:bg-foreground/5 data-[active=true]:bg-foreground/10 data-[active=true]:text-foreground";

export function ModuleNav({
	workspaceId,
	workspaceSlug,
	modules,
}: {
	workspaceId: string;
	workspaceSlug: string | null;
	modules: ModuleNavigationItem[];
}) {
	const pathname = usePathname();
	const overviewHref = `/${workspaceId}`;

	return (
		<>
			<SidebarContent>
				<SidebarGroup className="px-3">
					<SidebarMenu>
						<SidebarMenuItem>
							<SidebarMenuButton
								asChild
								isActive={pathname === overviewHref}
								className={navButton}
							>
								<Link href={overviewHref}>
									<House /> <span>Overview</span>
								</Link>
							</SidebarMenuButton>
						</SidebarMenuItem>
					</SidebarMenu>
				</SidebarGroup>
				<SidebarGroup className="px-3">
					<SidebarGroupLabel>Workspace modules</SidebarGroupLabel>
					<SidebarMenu>
						{modules.map(({ id, label }) => {
							const href = `/${workspaceId}/${id}`;
							return (
								<SidebarMenuItem key={id}>
									<SidebarMenuButton
										asChild
										isActive={
											pathname === href || pathname.startsWith(`${href}/`)
										}
										className={navButton}
									>
										<Link href={href}>
											<ModuleIcon id={id} /> <span>{label}</span>
										</Link>
									</SidebarMenuButton>
								</SidebarMenuItem>
							);
						})}
					</SidebarMenu>
				</SidebarGroup>
			</SidebarContent>
			<SidebarFooter className="border-sidebar-border border-t px-3 py-2">
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton asChild className={navButton}>
							<a
								href={
									workspaceSlug
										? `${ACCOUNT_URL}/workspaces/${workspaceSlug}`
										: ACCOUNT_URL
								}
							>
								<Gear /> <span>Manage workspace</span>
							</a>
						</SidebarMenuButton>
					</SidebarMenuItem>
					<SidebarMenuItem>
						<SidebarMenuButton asChild className={navButton}>
							<a href={ACCOUNT_URL}>
								<ArrowLeft /> <span>Back to QuickEngine</span>
							</a>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarFooter>
		</>
	);
}
