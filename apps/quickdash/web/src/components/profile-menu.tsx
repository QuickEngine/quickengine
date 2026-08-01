import {
	ArrowCounterClockwiseIcon,
	GaugeIcon,
	SignOutIcon,
} from "@phosphor-icons/react";
import { authClient } from "@quickengine/auth/client";
import { GeneratedAvatar, ThemeSwitch } from "@quickengine/ui";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@quickengine/ui/components/ui/dropdown-menu";
import {
	Sheet,
	SheetContent,
	SheetTitle,
	SheetTrigger,
} from "@quickengine/ui/components/ui/sheet";
import { useIsMobile } from "@quickengine/ui/hooks/use-mobile";
import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { restartQuickDashOrientationAction } from "../_lib/quickdash-orientation-actions";
import { clientEnv } from "../lib/env";
import {
	clearNativeToken,
	isNativeShell,
	nativeAuthHeaders,
} from "../lib/native-auth";

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
	workspaceId,
	seed,
	name,
	email,
	planId,
	mobileItems,
}: {
	workspaceId: string;
	seed: string;
	name: string;
	email: string;
	/** Shown in the mobile trigger only. */
	planId?: string | null;
	/** Rail-bottom items, folded in on mobile once the rail has collapsed. */
	mobileItems?: ReactNode;
}) {
	const isMobile = useIsMobile();
	const queryClient = useQueryClient();
	const [pending, setPending] = useState(false);
	const [orientationError, setOrientationError] = useState<string | null>(null);
	const displayName = name || email;

	async function restartOrientation() {
		setPending(true);
		setOrientationError(null);
		const result = await restartQuickDashOrientationAction(workspaceId);
		// The context is a TanStack query, not router state — `router.invalidate()`
		// refetches neither, so the client kept its cached `shouldOffer: false` and
		// nothing reappeared even though the server had reset it.
		if (result.ok) {
			await queryClient.invalidateQueries({
				queryKey: ["quickdash", workspaceId, "context"],
			});
		} else setOrientationError(result.error);
		setPending(false);
	}
	const signOutHref = `${clientEnv.AUTH_URL}/signout?redirect=${encodeURIComponent(clientEnv.WEB_URL)}`;

	// 🔴 The shell cannot sign out through the auth site. What signs it in is the
	// stored token, not a cookie, so clearing the cookie would leave the app fully
	// signed in — and it would strand this window on a surface that cannot sign
	// back in, because OAuth there runs in an embedded webview. Revoke with the
	// token, drop it, return to the shell's own sign-in.
	const nativeSignOut = async (event: React.MouseEvent) => {
		event.preventDefault();
		try {
			await authClient.signOut({
				fetchOptions: { headers: nativeAuthHeaders() },
			});
		} catch {
			// The session may already be gone server-side. Clearing locally is what
			// actually signs this window out, and it happens either way.
		}
		clearNativeToken();
		window.location.replace("/native-signin");
	};
	const onSignOut = isNativeShell() ? nativeSignOut : undefined;

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
					{/* Identity first. On a product where one person can hold several
					    workspaces and organisations, "which account am I?" is the question
					    this menu exists to answer before it offers anything.

					    It is also the account-settings link now, rather than repeating the
					    same destination as a separate row underneath itself. */}
					<MenuRow asChild className="gap-2.5 px-2 py-2">
						<a href={`${clientEnv.ACCOUNT_URL}/settings/profile`}>
							<span className="size-7 shrink-0 overflow-hidden rounded-full">
								<GeneratedAvatar seed={seed} className="size-full" />
							</span>
							<span className="min-w-0">
								<span className="block truncate font-body font-[450] text-[13px] text-ink">
									{displayName}
								</span>
								<span className="block truncate font-body text-[11px] text-dim">
									{email}
								</span>
							</span>
						</a>
					</MenuRow>
					{/* Personal, not workspace-scoped — the theme follows you across every
					    app, so it sits with "you and your account" rather than in the rail.
					    Not a menu item: three options need to be visible at once, and a
					    submenu for a two-click preference is friction for no gain. */}
					<div className="flex items-center justify-between gap-3 px-2 py-1.5">
						<span className="font-body text-[13px] text-ink">Theme</span>
						<ThemeSwitch />
					</div>

					{/* 🔴 TEMPORARY — a way to re-trigger the tour while it is being
					    designed. There is no other route back to it once completed or
					    skipped, which is correct for customers and useless for building it.
					    Remove before this ships, or move it somewhere deliberate. */}
					<MenuRow
						disabled={pending}
						onSelect={restartOrientation}
						className="text-[13px]"
					>
						<ArrowCounterClockwiseIcon size={14} />
						Restart tour
					</MenuRow>

					{/* Org-scoped, so it belongs here rather than in the rail — usage does
					    not change when you switch workspace. Links out to the account app,
					    where the real report lives. */}
					<MenuRow asChild className="text-[13px]">
						<a href={`${clientEnv.ACCOUNT_URL}/usage`}>
							<GaugeIcon size={14} />
							Usage
						</a>
					</MenuRow>
					{mobileItems}

					<MenuRow asChild className="text-[13px]">
						<a href={signOutHref} onClick={onSignOut}>
							<SignOutIcon size={14} />
							Sign out
						</a>
					</MenuRow>
					{orientationError ? (
						<p
							className="px-2 py-1.5 font-body text-[11px] text-destructive"
							role="alert"
						>
							{orientationError}
						</p>
					) : null}
				</SheetContent>
			</Sheet>
		);
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				data-orientation-target="account"
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
				{/* Identity first. On a product where one person can hold several
				    workspaces and organisations, "which account am I?" is the question
				    this menu exists to answer before it offers anything.

				    It is also the account-settings link now, rather than repeating the
				    same destination as a separate row underneath itself. */}
				<DropdownMenuItem asChild className="gap-2.5 px-2 py-2">
					<a href={`${clientEnv.ACCOUNT_URL}/settings/profile`}>
						<span className="size-7 shrink-0 overflow-hidden rounded-full">
							<GeneratedAvatar seed={seed} className="size-full" />
						</span>
						<span className="min-w-0">
							<span className="block truncate font-body font-[450] text-[13px] text-ink">
								{displayName}
							</span>
							<span className="block truncate font-body text-[11px] text-dim">
								{email}
							</span>
						</span>
					</a>
				</DropdownMenuItem>
				{/* Personal, not workspace-scoped — the theme follows you across every
				    app, so it sits with "you and your account" rather than in the rail.
				    Not a menu item: three options need to be visible at once, and a
				    submenu for a two-click preference is friction for no gain. */}
				<div className="flex items-center justify-between gap-3 px-2 py-1.5">
					<span className="font-body text-[13px] text-ink">Theme</span>
					<ThemeSwitch />
				</div>

				{/* 🔴 TEMPORARY — a way to re-trigger the tour while it is being
				    designed. There is no other route back to it once completed or
				    skipped, which is correct for customers and useless for building it.
				    Remove before this ships, or move it somewhere deliberate. */}
				<DropdownMenuItem
					disabled={pending}
					onSelect={restartOrientation}
					className="text-[13px]"
				>
					<ArrowCounterClockwiseIcon size={14} />
					Restart tour
				</DropdownMenuItem>

				{/* Org-scoped, so it belongs here rather than in the rail — usage does
				    not change when you switch workspace. Links out to the account app,
				    where the real report lives. */}
				<DropdownMenuItem asChild className="text-[13px]">
					<a href={`${clientEnv.ACCOUNT_URL}/usage`}>
						<GaugeIcon size={14} />
						Usage
					</a>
				</DropdownMenuItem>
				<DropdownMenuItem asChild className="text-[13px]">
					<a href={signOutHref} onClick={onSignOut}>
						<SignOutIcon size={14} />
						Sign out
					</a>
				</DropdownMenuItem>
				{orientationError ? (
					<p
						className="px-2 py-1.5 font-body text-[11px] text-destructive"
						role="alert"
					>
						{orientationError}
					</p>
				) : null}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
