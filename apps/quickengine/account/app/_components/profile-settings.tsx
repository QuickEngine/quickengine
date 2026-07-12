"use client";

import { authClient, useSession } from "@quickengine/auth/client";
import { GeneratedAvatar } from "@quickengine/ui";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@quickengine/ui/components/ui/alert-dialog";
import { Avatar } from "@quickengine/ui/components/ui/avatar";
import { type FormEvent, type MouseEvent, useEffect, useState } from "react";
import { deleteAccount } from "../_lib/account-actions";

const primaryBtn =
	"rounded-lg bg-foreground px-4 py-2 font-medium text-background text-sm transition-opacity hover:opacity-90 disabled:opacity-50";
const inputCls =
	"w-full rounded-lg border border-input bg-transparent px-3 py-2 text-foreground text-sm outline-none focus-visible:ring-2 focus-visible:ring-foreground/40";

// After deletion the DB session is gone; route through sign-out to clear the
// stale cookie (and its short-lived cache), landing on sign-up to start over.
const AUTH_URL =
	process.env.NEXT_PUBLIC_QUICKENGINE_AUTH_URL ?? "http://localhost:3002";
const AFTER_DELETE_HREF = `${AUTH_URL}/signout?redirect=${encodeURIComponent(`${AUTH_URL}/signup`)}`;

export function ProfileSettings() {
	const { data: session } = useSession();
	const user = session?.user;

	const [name, setName] = useState("");
	const [pending, setPending] = useState(false);
	const [saved, setSaved] = useState(false);
	const [error, setError] = useState("");
	const [deleting, setDeleting] = useState(false);
	const [deleteError, setDeleteError] = useState("");

	useEffect(() => {
		if (user?.name) {
			setName(user.name);
		}
	}, [user?.name]);

	async function save(event: FormEvent) {
		event.preventDefault();
		setPending(true);
		setSaved(false);
		setError("");
		const { error: updateError } = await authClient.updateUser({ name });
		setPending(false);
		if (updateError) {
			setError(updateError.message ?? "Couldn't save.");
			return;
		}
		setSaved(true);
	}

	async function onDeleteAccount(event: MouseEvent<HTMLButtonElement>) {
		// Keep the dialog open (showing "Deleting…") until the redirect navigates
		// away; Radix would otherwise close it the instant the action is clicked.
		event.preventDefault();
		setDeleting(true);
		setDeleteError("");
		try {
			await deleteAccount();
			window.location.href = AFTER_DELETE_HREF;
		} catch {
			setDeleting(false);
			setDeleteError("Couldn't delete your account. Please try again.");
		}
	}

	return (
		<div className="flex max-w-md flex-col gap-6">
			<div className="flex items-center gap-4">
				<Avatar className="size-14">
					<GeneratedAvatar seed={user?.id ?? "user"} className="size-full" />
				</Avatar>
				<div className="min-w-0">
					<div className="truncate font-medium text-foreground text-sm">
						{user?.name || user?.email}
					</div>
					<div className="truncate text-muted-foreground text-xs">
						{user?.email}
					</div>
				</div>
			</div>

			<form onSubmit={save} className="flex flex-col gap-3">
				<label className="flex flex-col gap-1.5">
					<span className="text-foreground text-sm">Name</span>
					<input
						className={inputCls}
						value={name}
						onChange={(e) => {
							setName(e.target.value);
							setSaved(false);
						}}
						placeholder="Your name"
					/>
				</label>
				<label className="flex flex-col gap-1.5">
					<span className="text-foreground text-sm">Email</span>
					<input
						className={`${inputCls} opacity-60`}
						value={user?.email ?? ""}
						readOnly
					/>
				</label>
				{error && <p className="text-red-400 text-sm">{error}</p>}
				<div className="flex items-center gap-3">
					<button type="submit" disabled={pending} className={primaryBtn}>
						{pending ? "Saving…" : "Save"}
					</button>
					{saved && (
						<span className="text-muted-foreground text-sm">Saved.</span>
					)}
				</div>
			</form>

			<div className="rounded-lg border border-red-500/25 bg-red-500/[0.03] p-4">
				<h3 className="font-medium text-foreground text-sm">Danger zone</h3>
				<p className="mt-1 text-muted-foreground text-xs">
					Permanently delete your account, workspaces, and all associated data.
					This can't be undone.
				</p>
				{deleteError && (
					<p className="mt-2 text-red-400 text-sm">{deleteError}</p>
				)}
				<AlertDialog>
					<AlertDialogTrigger asChild>
						<button
							type="button"
							className="mt-3 rounded-lg border border-red-500/40 px-4 py-2 font-medium text-red-400 text-sm transition-colors hover:bg-red-500/10"
						>
							Delete account
						</button>
					</AlertDialogTrigger>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>Delete your account?</AlertDialogTitle>
							<AlertDialogDescription>
								This permanently deletes your account, every workspace, and all
								associated data. You'll be signed out. This can't be undone.
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
							<AlertDialogAction
								onClick={onDeleteAccount}
								disabled={deleting}
								className="bg-red-500 text-white hover:bg-red-500/90"
							>
								{deleting ? "Deleting…" : "Delete account"}
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</div>
		</div>
	);
}
