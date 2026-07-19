"use client";

import {
	ChartBar,
	Check,
	CreditCard,
	type Icon,
	Key,
	Lifebuoy,
	Palette,
	ShieldCheck,
	Translate,
	User,
	UsersThree,
} from "@phosphor-icons/react";
import { StatusIndicator } from "@quickengine/ui";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
	DialogTrigger,
} from "@quickengine/ui/components/ui/dialog";
import {
	Sidebar,
	SidebarContent,
	SidebarGroup,
	SidebarGroupContent,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarProvider,
} from "@quickengine/ui/components/ui/sidebar";
import type { ReactNode } from "react";
import { useState } from "react";
import { ActiveSessions } from "./active-sessions";
import { BillingSettings } from "./billing-settings";
import { ProfileSettings } from "./profile-settings";
import { SecuritySettings } from "./security-settings";
import { ThemeSwitch } from "./theme-switch";

// Neutral active/hover fills — overrides the shadcn default's blue-ish
// sidebar-accent so the dialog nav matches the rest of the app.
const sectionButton =
	"hover:bg-foreground/5 active:bg-foreground/5 data-[active=true]:bg-foreground/10 data-[active=true]:text-foreground";

type Section = { name: string; icon: Icon };

const sections: Section[] = [
	{ name: "Profile", icon: User },
	{ name: "Security", icon: ShieldCheck },
	{ name: "API keys", icon: Key },
	{ name: "Team", icon: UsersThree },
	{ name: "Billing", icon: CreditCard },
	{ name: "Usage", icon: ChartBar },
	{ name: "Appearance", icon: Palette },
	{ name: "Language", icon: Translate },
	{ name: "Support", icon: Lifebuoy },
];

// Placeholder locales — English + Tagalog out of the gate (built by hand today;
// full i18n wires in later).
const LANGUAGES = ["English", "Tagalog"];

// The public status + support pages live on the web app.
const WEB_URL =
	process.env.NEXT_PUBLIC_QUICKENGINE_WEB_URL ?? "https://quickengine.xyz";

// Settings, as a dialog with its own sidebar (the sidebar-13 pattern): categories
// on the left, the selected category's content on the right.
export function SettingsDialog({ children }: { children: ReactNode }) {
	const [active, setActive] = useState("Profile");
	const [language, setLanguage] = useState("English");

	return (
		<Dialog>
			<DialogTrigger asChild>{children}</DialogTrigger>
			<DialogContent className="gap-0 overflow-hidden p-0 md:max-h-[520px] md:max-w-[760px]">
				<DialogTitle className="sr-only">Settings</DialogTitle>
				<DialogDescription className="sr-only">
					Manage your account settings.
				</DialogDescription>
				<SidebarProvider className="min-h-0 items-start">
					<Sidebar
						collapsible="none"
						className="hidden border-sidebar-border border-r md:flex"
					>
						<SidebarContent>
							<SidebarGroup>
								<SidebarGroupContent>
									<SidebarMenu>
										{sections.map(({ name, icon: IconComponent }) => (
											<SidebarMenuItem key={name}>
												<SidebarMenuButton
													isActive={active === name}
													onClick={() => setActive(name)}
													className={sectionButton}
												>
													<IconComponent />
													<span>{name}</span>
												</SidebarMenuButton>
											</SidebarMenuItem>
										))}
									</SidebarMenu>
								</SidebarGroupContent>
							</SidebarGroup>
						</SidebarContent>
					</Sidebar>
					<main className="flex h-[520px] flex-1 flex-col overflow-hidden">
						<header className="flex h-14 shrink-0 items-center border-sidebar-border border-b px-5">
							<h2 className="font-medium text-foreground text-sm">{active}</h2>
						</header>
						<div className="flex-1 overflow-y-auto p-5">
							{active === "Profile" ? (
								<ProfileSettings />
							) : active === "Security" ? (
								<div className="flex flex-col gap-8">
									<SecuritySettings />
									<ActiveSessions />
								</div>
							) : active === "Billing" ? (
								<BillingSettings />
							) : active === "Appearance" ? (
								<div className="flex items-center justify-between gap-4">
									<div className="flex flex-col">
										<span className="text-foreground text-sm">Theme</span>
										<span className="text-muted-foreground text-xs">
											Choose light, dark, or match your system.
										</span>
									</div>
									<ThemeSwitch />
								</div>
							) : active === "Language" ? (
								<div className="flex max-w-sm flex-col gap-1">
									<span className="mb-1 text-muted-foreground text-xs">
										Display language for your account.
									</span>
									{LANGUAGES.map((lang) => (
										<button
											key={lang}
											type="button"
											onClick={() => setLanguage(lang)}
											className="flex items-center justify-between rounded-md px-3 py-2 text-left text-foreground text-sm transition-colors hover:bg-foreground/5"
										>
											{lang}
											{language === lang ? <Check className="size-4" /> : null}
										</button>
									))}
								</div>
							) : active === "Support" ? (
								<div className="flex flex-col gap-4">
									<div className="flex items-center justify-between gap-4">
										<div className="flex flex-col">
											<span className="text-foreground text-sm">
												System status
											</span>
											<span className="text-muted-foreground text-xs">
												Live status of QuickEngine services.
											</span>
										</div>
										<StatusIndicator
											endpoint="/api/health"
											href={`${WEB_URL}/status`}
										/>
									</div>
									<a
										href={`${WEB_URL}/support`}
										className="w-fit text-foreground text-sm underline-offset-4 hover:underline"
									>
										Contact support →
									</a>
								</div>
							) : (
								<p className="text-muted-foreground text-sm">
									{active} settings coming soon.
								</p>
							)}
						</div>
					</main>
				</SidebarProvider>
			</DialogContent>
		</Dialog>
	);
}
