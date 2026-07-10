"use client";

import { authClient, useSession } from "@quickengine/auth/client";
import { GeneratedAvatar } from "@quickengine/ui";
import { Avatar } from "@quickengine/ui/components/ui/avatar";
import { type FormEvent, useEffect, useState } from "react";

const primaryBtn =
	"rounded-lg bg-foreground px-4 py-2 font-medium text-background text-sm transition-opacity hover:opacity-90 disabled:opacity-50";
const inputCls =
	"w-full rounded-lg border border-input bg-transparent px-3 py-2 text-foreground text-sm outline-none focus-visible:ring-2 focus-visible:ring-foreground/40";

export function ProfileSettings() {
	const { data: session } = useSession();
	const user = session?.user;

	const [name, setName] = useState("");
	const [pending, setPending] = useState(false);
	const [saved, setSaved] = useState(false);
	const [error, setError] = useState("");

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
		</div>
	);
}
