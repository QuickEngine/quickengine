import { ArrowLeft, Gear, House, Plugs } from "@phosphor-icons/react";
import {
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@quickengine/ui/components/ui/sidebar";
import { Link, useRouterState } from "@tanstack/react-router";
import { clientEnv } from "../lib/env";
import { ModuleIcon } from "./module-icon";

const labels: Readonly<Record<string, string>> = {
	"client-records": "Client Records",
	invoicing: "Invoicing",
	payments: "Payments",
	fulfillment: "Fulfillment",
	files: "Files & Documents",
	"products-services": "Products & Services",
	orders: "Orders",
	inventory: "Inventory",
	shipping: "Shipping",
	bookings: "Bookings",
	"projects-tasks": "Projects & Tasks",
	"time-tracking": "Time Tracking",
	"quotes-estimates": "Quotes & Estimates",
	"contracts-esign": "Contracts & E-sign",
	"reporting-analytics": "Reporting & Analytics",
};
const navButton =
	"hover:bg-foreground/5 active:bg-foreground/5 data-[active=true]:bg-foreground/10 data-[active=true]:text-foreground";

export function ModuleNav({
	workspaceId,
	workspaceSlug,
	moduleIds,
}: {
	workspaceId: string;
	workspaceSlug: string | null;
	moduleIds: string[];
}) {
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	const overviewHref = `/${workspaceId}`;
	return (
		<>
			<SidebarContent data-orientation-target="module-navigation">
				<SidebarGroup className="px-3">
					<SidebarMenu>
						<SidebarMenuItem>
							<SidebarMenuButton
								asChild
								isActive={pathname === overviewHref}
								className={navButton}
							>
								<Link to="/$workspace" params={{ workspace: workspaceId }}>
									<House /> <span>Overview</span>
								</Link>
							</SidebarMenuButton>
						</SidebarMenuItem>
					</SidebarMenu>
				</SidebarGroup>
				<SidebarGroup className="px-3">
					<SidebarGroupLabel>Workspace modules</SidebarGroupLabel>
					<SidebarMenu>
						{moduleIds.map((id) => {
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
										<Link
											to="/$workspace/$module"
											params={{ workspace: workspaceId, module: id }}
										>
											<ModuleIcon id={id} /> <span>{labels[id] ?? id}</span>
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
						<SidebarMenuButton
							asChild
							isActive={pathname === `/${workspaceId}/connect`}
							className={navButton}
						>
							<Link
								to="/$workspace/connect"
								params={{ workspace: workspaceId }}
							>
								<Plugs /> <span>Connect</span>
							</Link>
						</SidebarMenuButton>
					</SidebarMenuItem>
					<SidebarMenuItem>
						<SidebarMenuButton asChild className={navButton}>
							<a
								data-orientation-target="workspace-settings"
								href={
									workspaceSlug
										? `${clientEnv.ACCOUNT_URL}/workspaces/${workspaceSlug}`
										: clientEnv.ACCOUNT_URL
								}
							>
								<Gear /> <span>Manage workspace</span>
							</a>
						</SidebarMenuButton>
					</SidebarMenuItem>
					<SidebarMenuItem>
						<SidebarMenuButton asChild className={navButton}>
							<a href={clientEnv.ACCOUNT_URL}>
								<ArrowLeft /> <span>Back to QuickEngine</span>
							</a>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarFooter>
		</>
	);
}
