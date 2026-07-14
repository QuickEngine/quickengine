"use client";

import { ArrowSquareOut } from "@phosphor-icons/react";
import { GeneratedAvatar } from "@quickengine/ui";
import { Avatar } from "@quickengine/ui/components/ui/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@quickengine/ui/components/ui/dropdown-menu";

const ACCOUNT_URL =
	process.env.NEXT_PUBLIC_QUICKENGINE_ACCOUNT_URL ?? "http://localhost:3001";
const AUTH_URL =
	process.env.NEXT_PUBLIC_QUICKENGINE_AUTH_URL ?? "http://localhost:3002";
const WEB_URL =
	process.env.NEXT_PUBLIC_QUICKENGINE_WEB_URL ?? "http://localhost:3000";

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
	const signOutHref = `${AUTH_URL}/signout?redirect=${encodeURIComponent(WEB_URL)}`;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-foreground/40">
				<Avatar className="size-8">
					<GeneratedAvatar seed={seed} className="size-full" />
				</Avatar>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" sideOffset={14} className="w-64">
				<div className="px-2 py-1.5">
					<p className="truncate font-medium text-sm">{displayName}</p>
					<p className="truncate text-muted-foreground text-xs">{email}</p>
				</div>
				<DropdownMenuSeparator />
				<DropdownMenuItem asChild>
					<a href={`${ACCOUNT_URL}/settings/profile`}>
						<ArrowSquareOut /> Account settings
					</a>
				</DropdownMenuItem>
				<DropdownMenuItem asChild>
					<a href={signOutHref}>Sign out</a>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
