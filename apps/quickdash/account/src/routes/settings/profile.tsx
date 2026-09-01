import { authClient, useSession } from "@quickengine/auth/client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { type CropShape, ImageCropper } from "../../components/image-cropper";
import { accountQueries, useActiveOrganization } from "../../lib/account-api";
import { api } from "../../lib/api";
import { clientEnv } from "../../lib/env";

/**
 * Your account — the person, not the organization.
 *
 * 🔴 Deleting an account takes every workspace it owns with it, and the API
 * refuses outright while any of those workspaces still hold stored files: the
 * rows would go and the bytes would stay, billed forever and attached to
 * nobody. The page states that before the button rather than after the 409.
 *
 * The confirmation is a typed name, not a second "are you sure". Nothing else
 * stops a determined mis-click on an irreversible action.
 */

const primaryAction =
	"inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--console-ink))] px-4 text-[12.5px] text-[var(--console-pop)] outline-none transition-opacity hover:opacity-85 focus-visible:opacity-85 disabled:pointer-events-none disabled:opacity-40";

const quietAction =
	"inline-flex h-9 shrink-0 items-center justify-center rounded-full border border-[var(--console-line-strong)] px-4 text-[12.5px] text-[var(--ink-60)] outline-none transition-colors hover:bg-[rgb(var(--console-ink)/0.06)] hover:text-[var(--ink-90)] disabled:pointer-events-none disabled:opacity-40";

const dangerAction =
	"inline-flex h-9 shrink-0 items-center justify-center rounded-full border border-[#ff3b3b]/30 px-4 text-[12.5px] text-[#ff6b6b] outline-none transition-colors hover:bg-[#ff3b3b]/[0.08] disabled:pointer-events-none disabled:opacity-40";

const field =
	"h-9 w-72 max-w-full rounded-full border border-[var(--console-line-strong)] bg-transparent px-3.5 text-[12.5px] text-[var(--ink-85)] outline-none transition-colors placeholder:text-[var(--ink-30)] focus:border-[rgb(var(--console-ink)/0.18)]";

const joined = (value: string | Date | undefined) =>
	value
		? new Intl.DateTimeFormat("en", {
				month: "long",
				day: "numeric",
				year: "numeric",
			}).format(new Date(value))
		: "—";

function ProfilePage() {
	const { data: session } = useSession();
	const { active, organizations } = useActiveOrganization();
	const workspaces = useQuery(accountQueries.workspaces(active?.id ?? ""));

	const user = session?.user;
	const [name, setName] = useState<string | null>(null);
	const [confirmText, setConfirmText] = useState("");
	const [deleting, setDeleting] = useState(false);
	const [failure, setFailure] = useState<string | null>(null);
	/**
	 * The two pictures on a person's profile.
	 *
	 * ⚠️ These were built for onboarding and moved here. Onboarding asks for the
	 * NAME only, because a name is the one thing the product cannot work without
	 * — `console-shell.tsx` renders `name || "Account"` — and every additional
	 * field at signup costs completion. Pictures are something somebody chooses
	 * to do, in a place with room to frame them properly.
	 */
	const [cropping, setCropping] = useState<{
		file: File;
		shape: CropShape;
	} | null>(null);
	const avatarInput = useRef<HTMLInputElement | null>(null);
	const bannerInput = useRef<HTMLInputElement | null>(null);
	const [note, setNote] = useState<string | null>(null);

	const currentName = name ?? user?.name ?? "";
	const dirty = currentName.trim() !== (user?.name ?? "").trim();

	const save = useMutation({
		mutationFn: async () => {
			const result = await authClient.updateUser({ name: currentName.trim() });
			if (result.error) throw new Error(result.error.message ?? "failed");
			return result;
		},
		onSuccess: () => {
			setFailure(null);
			setNote("Saved.");
			setName(null);
		},
		onError: (error: { message?: string }) =>
			setFailure(error?.message ?? "That could not be saved."),
	});

	/**
	 * ⚠️ Uploads the CROPPED blob, never the original file. The browser has
	 * already reduced a camera original to a 512px square or a 1500x500 banner, so
	 * what crosses the network is typically under 200 KB and the server stores it
	 * as given — no image library, no resize queue, no decompression bomb.
	 */
	const uploadImage = useMutation({
		mutationFn: async ({ kind, blob }: { kind: CropShape; blob: Blob }) => {
			const form = new FormData();
			form.set("kind", kind === "circle" ? "avatar" : "banner");
			form.set("file", new File([blob], `${kind}.jpg`, { type: "image/jpeg" }));
			const uploaded = await api.request<{ url: string }>("/account/images", {
				method: "POST",
				body: form,
			});
			await api.request("/account/profile", {
				method: "PATCH",
				body:
					kind === "circle"
						? { image: uploaded.data.url }
						: { bannerImage: uploaded.data.url },
			});
			return uploaded.data.url;
		},
		onSuccess: async () => {
			setCropping(null);
			setFailure(null);
			setNote("Saved.");
			// The session carries `image`, so the avatar in the shell is stale until
			// it is refetched — otherwise a new picture appears here and nowhere else.
			await authClient.getSession({ query: { disableCookieCache: true } });
		},
		onError: () => {
			setCropping(null);
			setFailure("That picture could not be uploaded.");
		},
	});

	const removeImage = useMutation({
		mutationFn: (kind: CropShape) =>
			api.request("/account/profile", {
				method: "PATCH",
				// 🔴 `null`, not omitted. The route reads an absent field as "leave it
				// alone", which is the only way an optional field can also be cleared.
				body: kind === "circle" ? { image: null } : { bannerImage: null },
			}),
		onSuccess: async () => {
			setNote("Removed.");
			await authClient.getSession({ query: { disableCookieCache: true } });
		},
		onError: () => setFailure("That picture could not be removed."),
	});

	const pick =
		(shape: CropShape) => (event: React.ChangeEvent<HTMLInputElement>) => {
			const file = event.target.files?.[0];
			// Reset first: choosing the SAME file twice fires no change event
			// otherwise, so a cancelled crop could never be restarted.
			event.target.value = "";
			if (file) setCropping({ file, shape });
		};

	const remove = useMutation({
		mutationFn: async () => api.request("/account", { method: "DELETE" }),
		onSuccess: () => {
			// Everything is gone, including the session — there is nowhere in the
			// product left to return to.
			window.location.href = `${clientEnv.WEB_URL}/`;
		},
		onError: (error: { message?: string }) =>
			setFailure(error?.message ?? "Your account could not be deleted."),
	});

	const ownedWorkspaces = (workspaces.data?.items ?? []).length;

	return (
		<main className="min-h-full bg-[var(--console-bg)] px-5 py-5">
			{failure ? (
				<p className="mb-4 text-[12px] text-[#ff6b6b]">{failure}</p>
			) : null}
			{note ? <p className="mb-4 text-[12px] text-[#3fb950]">{note}</p> : null}

			<p className="mb-1 text-[12.5px] text-[var(--ink-45)]">You</p>
			<div className="border-[var(--console-line-soft)] border-t py-4">
				{cropping ? (
					<div className="mb-5 rounded-xl border border-[var(--console-line)] bg-[var(--console-pop)] p-5">
						<p className="mb-4 text-[12.5px] text-[var(--ink-45)]">
							Drag to move, zoom to fill. Only what is inside the frame is
							saved.
						</p>
						<ImageCropper
							file={cropping.file}
							shape={cropping.shape}
							busy={uploadImage.isPending}
							onCancel={() => setCropping(null)}
							onCropped={(blob) =>
								uploadImage.mutate({ kind: cropping.shape, blob })
							}
						/>
					</div>
				) : null}

				{/* The banner, then the avatar pulled up over its lower edge. That
				    overlap is the detail that makes the block read as a profile rather
				    than as two unrelated pictures stacked on a settings page. */}
				<button
					type="button"
					onClick={() => bannerInput.current?.click()}
					style={
						user?.bannerImage
							? {
									backgroundImage: `url(${user.bannerImage})`,
									backgroundSize: "cover",
									backgroundPosition: "center",
								}
							: undefined
					}
					className="group relative block h-[7.5rem] w-full overflow-hidden rounded-xl border border-[var(--console-line)] bg-[rgb(var(--console-ink)/0.04)] transition-colors duration-200 hover:border-[rgb(var(--console-ink)/0.20)]"
				>
					<span className="flex h-full items-center justify-center text-[12px] text-[var(--ink-30)] transition-colors duration-200 group-hover:text-[var(--ink-60)]">
						{user?.bannerImage ? "" : "Add a banner"}
					</span>
				</button>

				<div className="-mt-8 mb-4 flex items-end justify-between gap-4 px-1">
					<button
						type="button"
						onClick={() => avatarInput.current?.click()}
						style={
							user?.image
								? {
										backgroundImage: `url(${user.image})`,
										backgroundSize: "cover",
										backgroundPosition: "center",
									}
								: undefined
						}
						className="group size-16 shrink-0 overflow-hidden rounded-full bg-[var(--console-bg)] ring-4 ring-[var(--console-bg)]"
					>
						<span
							className={`flex size-full items-center justify-center rounded-full border border-[var(--console-line)] text-[11px] transition-colors duration-200 ${
								user?.image
									? "border-transparent bg-black/45 text-white opacity-0 group-hover:opacity-100"
									: "text-[var(--ink-40)] group-hover:text-[var(--ink-70)]"
							}`}
						>
							{user?.image ? "Change" : "Add photo"}
						</span>
					</button>

					{/* Only offered for a picture that exists. A remove control beside an
					    empty slot is a button that does nothing. */}
					<div className="flex items-center gap-3 pb-1">
						{user?.image ? (
							<button
								type="button"
								onClick={() => removeImage.mutate("circle")}
								className="text-[11px] text-[var(--ink-30)] transition-colors hover:text-[var(--ink-70)]"
							>
								Remove photo
							</button>
						) : null}
						{user?.bannerImage ? (
							<button
								type="button"
								onClick={() => removeImage.mutate("banner")}
								className="text-[11px] text-[var(--ink-30)] transition-colors hover:text-[var(--ink-70)]"
							>
								Remove banner
							</button>
						) : null}
					</div>
				</div>

				<input
					ref={avatarInput}
					type="file"
					accept="image/*"
					hidden
					onChange={pick("circle")}
				/>
				<input
					ref={bannerInput}
					type="file"
					accept="image/*"
					hidden
					onChange={pick("banner")}
				/>

				<div className="flex items-center gap-4">
					<div className="min-w-0">
						{/* 🔴 The email is shown, never edited here. Changing it is an
						    identity change that has to be verified through the auth app, not
						    a text field on a settings page. */}
						<p className="truncate text-[13px] text-[var(--ink-85)]">
							{user?.email ?? "—"}
						</p>
						<p className="mt-0.5 text-[11px] text-[var(--ink-30)]">
							Joined {joined(user?.createdAt)}
						</p>
					</div>
				</div>

				<form
					onSubmit={(event) => {
						event.preventDefault();
						if (dirty && currentName.trim()) save.mutate();
					}}
					className="mt-5 flex flex-wrap items-end gap-2"
				>
					<div>
						<label
							htmlFor="profile-name"
							className="mb-1.5 block text-[11px] text-[var(--ink-40)]"
						>
							Name
						</label>
						<input
							id="profile-name"
							value={currentName}
							onChange={(event) => {
								setName(event.target.value);
								setNote(null);
							}}
							placeholder="Your name"
							className={field}
						/>
					</div>
					<button
						type="submit"
						disabled={!dirty || !currentName.trim() || save.isPending}
						className={`${primaryAction} ${save.isPending ? "shimmer-busy" : ""}`}
					>
						{save.isPending ? "Saving…" : "Save"}
					</button>
					{dirty ? (
						<button
							type="button"
							onClick={() => setName(null)}
							className={quietAction}
						>
							Cancel
						</button>
					) : null}
				</form>
				<p className="mt-2 text-[11px] text-[var(--ink-30)]">
					This is the name teammates see beside your activity.
				</p>
			</div>

			<p className="mt-8 mb-1 text-[12.5px] text-[var(--ink-45)]">
				Where you belong
			</p>
			<div className="divide-y divide-[var(--console-line-soft)] border-[var(--console-line-soft)] border-t">
				{(organizations.data?.items ?? []).map((organization) => (
					<div
						key={organization.id}
						className="flex items-center gap-4 py-3 text-[12.5px]"
					>
						<p className="min-w-0 flex-1 truncate text-[var(--ink-85)]">
							{organization.name}
						</p>
						<p className="w-28 shrink-0 text-[11.5px] text-[var(--ink-40)] capitalize">
							{organization.role}
						</p>
						<p className="w-24 shrink-0 text-right text-[11px] text-[var(--ink-25)]">
							{organization.isPersonal ? "personal" : "shared"}
						</p>
					</div>
				))}
			</div>

			{/* 🔴 Irreversible, and it takes the workspaces with it. */}
			<p className="mt-10 mb-1 text-[12.5px] text-[#ff6b6b]">Delete account</p>
			<div className="border-[#ff3b3b]/20 border-t py-4">
				<p className="max-w-2xl text-[11.5px] text-[var(--ink-40)] leading-5">
					Deleting your account removes it permanently, along with every
					workspace you own
					{ownedWorkspaces > 0 ? ` — ${ownedWorkspaces} right now — ` : " "}
					and all of their records. It cannot be undone, and it is refused while
					any of those workspaces still hold stored files.
				</p>

				{deleting ? (
					<div className="mt-4">
						<label
							htmlFor="delete-confirm"
							className="mb-1.5 block text-[11px] text-[var(--ink-40)]"
						>
							Type <span className="text-[var(--ink-75)]">{user?.email}</span>{" "}
							to confirm
						</label>
						<div className="flex flex-wrap items-center gap-2">
							<input
								id="delete-confirm"
								value={confirmText}
								onChange={(event) => setConfirmText(event.target.value)}
								placeholder={user?.email ?? ""}
								className={field}
							/>
							<button
								type="button"
								disabled={confirmText !== user?.email || remove.isPending}
								onClick={() => remove.mutate()}
								className={dangerAction}
							>
								{remove.isPending ? "Deleting…" : "Delete my account"}
							</button>
							<button
								type="button"
								onClick={() => {
									setDeleting(false);
									setConfirmText("");
								}}
								className={quietAction}
							>
								Cancel
							</button>
						</div>
					</div>
				) : (
					<button
						type="button"
						onClick={() => {
							setFailure(null);
							setDeleting(true);
						}}
						className={`${dangerAction} mt-4`}
					>
						Delete my account
					</button>
				)}
			</div>
		</main>
	);
}

export const Route = createFileRoute("/settings/profile")({
	component: ProfilePage,
});
