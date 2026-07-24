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
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { restartQuickDashOrientationAction } from "../_lib/quickdash-orientation-actions";

const ACCOUNT_URL =
	process.env.NEXT_PUBLIC_QUICKENGINE_ACCOUNT_URL ?? "http://localhost:3001";
const AUTH_URL =
	process.env.NEXT_PUBLIC_QUICKENGINE_AUTH_URL ?? "http://localhost:3002";
const WEB_URL =
	process.env.NEXT_PUBLIC_QUICKENGINE_WEB_URL ?? "http://localhost:3000";

export function ProfileMenu({
	workspaceId,
	seed,
	name,
	email,
}: {
	workspaceId: string;
	seed: string;
	name: string;
	email: string;
}) {
	const router = useRouter();
	const [orientationError, setOrientationError] = useState<string | null>(null);
	const [pending, startTransition] = useTransition();
	const displayName = name || email;
	const signOutHref = `${AUTH_URL}/signout?redirect=${encodeURIComponent(WEB_URL)}`;

	function restartOrientation() {
		setOrientationError(null);
		startTransition(async () => {
			const result = await restartQuickDashOrientationAction(workspaceId);
			if (result.ok) router.refresh();
			else setOrientationError(result.error);
		});
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				data-orientation-target="account"
				className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-foreground/40"
			>
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
				<DropdownMenuItem disabled={pending} onSelect={restartOrientation}>
					Restart QuickDash tour
				</DropdownMenuItem>
				<DropdownMenuItem asChild>
					<a href={`${ACCOUNT_URL}/settings/profile`}>
						<ArrowSquareOut /> Account settings
					</a>
				</DropdownMenuItem>
				<DropdownMenuItem asChild>
					<a href={signOutHref}>Sign out</a>
				</DropdownMenuItem>
				{orientationError && (
					<p className="px-2 py-1.5 text-destructive text-xs" role="alert">
						{orientationError}
					</p>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
