"use client";

import { GeneratedAvatar } from "@quickengine/ui";
import { Avatar } from "@quickengine/ui/components/ui/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@quickengine/ui/components/ui/dropdown-menu";

const AUTH_URL =
	process.env.NEXT_PUBLIC_QUICKENGINE_AUTH_URL ?? "http://localhost:3002";
const WEB_URL =
	process.env.NEXT_PUBLIC_QUICKENGINE_WEB_URL ?? "http://localhost:3000";

// Sign-out routes through the auth IdP (same-origin there — no cross-origin call).
const SIGN_OUT_HREF = `${AUTH_URL}/signout?redirect=${encodeURIComponent(WEB_URL)}`;

// Clickable profile avatar with an account dropdown.
export function ProfileMenu({
	seed,
	name,
	email,
}: {
	seed: string;
	name: string;
	email: string;
}) {
	const displayName = name || email;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-foreground/40">
				<Avatar className="size-8">
					<GeneratedAvatar seed={seed} className="size-full" />
				</Avatar>
			</DropdownMenuTrigger>
			{/* Drops to the same level as the account-switcher menu. The avatar
			    trigger is taller than that caret, so it needs a smaller offset (by
			    the height difference) to land both menu tops on the same line.
			    15.75rem (vs 16) makes the left edge line up with the search bar's. */}
			<DropdownMenuContent align="end" sideOffset={14} className="w-[15.75rem]">
				{/* Header: avatar + name + email, links to the profile. */}
				<DropdownMenuItem asChild className="h-auto gap-2.5 py-2">
					<a href="/settings/profile">
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
					</a>
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem asChild>
					<a href="/settings/profile">Account settings</a>
				</DropdownMenuItem>
				<DropdownMenuItem asChild>
					<a href={SIGN_OUT_HREF}>Sign out</a>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
