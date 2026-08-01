import { GeneratedAvatar } from "@quickengine/ui";
import { Avatar } from "@quickengine/ui/components/ui/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@quickengine/ui/components/ui/dropdown-menu";
import {
	Sheet,
	SheetContent,
	SheetTitle,
	SheetTrigger,
} from "@quickengine/ui/components/ui/sheet";
import { useIsMobile } from "@quickengine/ui/hooks/use-mobile";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { clientEnv } from "../lib/env";

// Sign-out routes through the auth IdP (same-origin there — no cross-origin call).
const SIGN_OUT_HREF = `${clientEnv.AUTH_URL}/signout?redirect=${encodeURIComponent(clientEnv.WEB_URL)}`;

// Clickable profile avatar with an account dropdown.
/**
 * A row inside the mobile sheet.
 *
 * 🔴 NOT `DropdownMenuItem`. That is a Radix primitive that reads DropdownMenu
 * context and throws outside one — aliasing it for the sheet crashed the whole
 * app into the error boundary. The two surfaces genuinely need different
 * elements; only the CONTENT is shared.
 *
 * `asChild` mirrors Radix's API so the same JSX works in both branches.
 */
function MenuRow({
	asChild,
	className,
	children,
	disabled,
	onSelect,
	...props
}: {
	asChild?: boolean;
	className?: string;
	children: ReactNode;
	disabled?: boolean;
	onSelect?: () => void;
}) {
	const shared = `flex h-9 w-full items-center gap-2.5 rounded-md px-2 font-body text-[13px] text-ink outline-none transition-colors active:bg-field disabled:opacity-50 [&>a]:flex [&>a]:h-full [&>a]:w-full [&>a]:items-center [&>a]:gap-2.5 ${className ?? ""}`;
	if (asChild) {
		return (
			<div className={shared} {...props}>
				{children}
			</div>
		);
	}
	return (
		<button
			type="button"
			disabled={disabled}
			onClick={onSelect}
			className={shared}
			{...props}
		>
			{children}
		</button>
	);
}

export function ProfileMenu({
	seed,
	name,
	email,
	planId,
	mobileItems,
}: {
	seed: string;
	name: string;
	email: string;
	/** Shown in the mobile trigger only. */
	planId?: string | null;
	/** Rail-bottom items, folded in on mobile once the rail has collapsed. */
	mobileItems?: ReactNode;
}) {
	const isMobile = useIsMobile();
	const displayName = name || email;

	// A dropdown anchored to a footer is a desktop pattern. On a phone the same
	// content becomes a sheet that slides up from the bottom — near the thumb,
	// full width, and dismissible by dragging rather than by finding a small
	// target. Rendered as one or the other rather than both-with-CSS, so there is
	// never a second copy of this menu in the DOM holding its own open state.
	if (isMobile) {
		return (
			<Sheet>
				<SheetTrigger asChild>
					<button
						type="button"
						aria-label="Account"
						className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left outline-none"
					>
						<span className="size-6 shrink-0 overflow-hidden rounded-full ring-1 ring-edge md:size-full md:ring-0">
							<GeneratedAvatar seed={seed} className="size-full" />
						</span>
						<span className="truncate font-body text-[13px] text-ink md:hidden">
							{name || email}
						</span>
						{planId ? (
							<span className="shrink-0 rounded-full bg-field px-2 py-0.5 font-body text-[10px] text-dim capitalize md:hidden">
								{planId}
							</span>
						) : null}
					</button>
				</SheetTrigger>
				<SheetContent
					side="bottom"
					className="gap-1 rounded-t-xl border-edge bg-void p-2 pb-4 [&>button]:hidden"
				>
					<SheetTitle className="sr-only">Account</SheetTitle>
					{/* Header: avatar + name + email, links to the profile. */}
					<MenuRow asChild className="h-auto gap-2.5 py-2">
						<Link to="/settings/profile">
							<Avatar className="size-8 shrink-0">
								<GeneratedAvatar seed={seed} className="size-full" />
							</Avatar>
							<span className="flex min-w-0 flex-col">
								<span className="truncate font-medium text-[13px] text-foreground">
									{displayName}
								</span>
								{name ? (
									<span className="truncate text-[12px] text-muted-foreground">
										{email}
									</span>
								) : null}
							</span>
						</Link>
					</MenuRow>
					<DropdownMenuSeparator />
					<MenuRow asChild>
						<Link to="/settings/profile">Account settings</Link>
					</MenuRow>
					{/* The rail's bottom group, folded in here on mobile — Settings in
					    Account, Feedback and Developers in QuickDash. Nowhere else to
					    live once the rail collapses. */}
					{mobileItems}

					<MenuRow asChild>
						<a href={SIGN_OUT_HREF}>Sign out</a>
					</MenuRow>
				</SheetContent>
			</Sheet>
		);
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				aria-label="Account"
				className="pointer-events-auto size-6 overflow-hidden rounded-full outline-none ring-1 ring-edge transition-opacity hover:opacity-85 focus-visible:ring-2 focus-visible:ring-glow"
			>
				<GeneratedAvatar seed={seed} className="size-full" />
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="end"
				sideOffset={10}
				className="flex w-60 flex-col gap-1"
			>
				{/* Header: avatar + name + email, links to the profile. */}
				<DropdownMenuItem asChild className="h-auto gap-2.5 py-2">
					<Link to="/settings/profile">
						<Avatar className="size-8 shrink-0">
							<GeneratedAvatar seed={seed} className="size-full" />
						</Avatar>
						<span className="flex min-w-0 flex-col">
							<span className="truncate font-medium text-[13px] text-foreground">
								{displayName}
							</span>
							{name ? (
								<span className="truncate text-[12px] text-muted-foreground">
									{email}
								</span>
							) : null}
						</span>
					</Link>
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem asChild>
					<Link to="/settings/profile">Account settings</Link>
				</DropdownMenuItem>
				<DropdownMenuItem asChild>
					<a href={SIGN_OUT_HREF}>Sign out</a>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
