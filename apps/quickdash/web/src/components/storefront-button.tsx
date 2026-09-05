import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { sessionApi, workspaceApi } from "../lib/api";
import { WriteFailure } from "./page-state";

/**
 * The shop, from the console.
 *
 * 🔑 Two things a person wants about their own site and has to leave to do:
 * look at it, and close it. Both are one press from the header now.
 *
 * 🔴 `published` is NOT `environment`. Mode says whether money is real;
 * published says whether strangers can buy. Closing a shop for an afternoon
 * must not touch its payment configuration, which is exactly why they are
 * separate columns and separate controls.
 */
/**
 * Your shop, as rows in a menu.
 *
 * 🔴 This was a button of its own in the header, with its own popover. It is a
 * property of the WORKSPACE — whether the workspace's shop is open, and where
 * it lives — so it belongs in the menu that is already about this workspace,
 * next to its settings. In the header it cost a permanent slot for something
 * most people touch twice a year, and it sat among controls that open panels
 * over the page, which is a different kind of verb.
 *
 * ⚠️ The CLOSED signal moved with it, onto the switcher's own badge. A shut shop
 * is the one state here worth interrupting somebody about: nobody can buy, and
 * it is invisible from inside the console. Burying that behind a menu without
 * putting the mark somewhere permanent would have traded a real warning for a
 * tidier header.
 */
export function StorefrontActions({
	workspaceId,
	organizationId,
	published,
}: {
	workspaceId: string;
	organizationId: string | null | undefined;
	published: boolean;
}) {
	const queryClient = useQueryClient();
	/**
	 * 🔴 The ERROR, not `error.message`.
	 *
	 * A string threw away the status and the request id at the moment the
	 * failure arrived, so a 500 printed a raw `HTTP 500` and support had
	 * nothing to trace. `fallback` survives because the per-action wording is
	 * better than anything a generic handler could produce.
	 */
	const [failure, setFailure] = useState<{
		error: unknown;
		fallback: string;
	} | null>(null);

	// The address the business gave us, on its own branding.
	const branding = useQuery({
		queryKey: ["quickdash", workspaceId, "branding"],
		queryFn: async () =>
			(
				await workspaceApi(workspaceId).request<{ websiteUrl?: string }>(
					"/quickdash/branding",
				)
			).data,
	});
	const site = branding.data?.websiteUrl?.trim();

	const setPublished = useMutation({
		mutationFn: async (next: boolean) => {
			await sessionApi.request(
				`/account/workspaces/${workspaceId}/published?organizationId=${encodeURIComponent(
					organizationId ?? "",
				)}`,
				{ method: "PATCH", body: { published: next } },
			);
		},
		onMutate: () => setFailure(null),
		onError: (error: { message?: string }) =>
			setFailure({ error: error, fallback: "That could not be changed." }),
		onSuccess: () =>
			queryClient.invalidateQueries({
				queryKey: ["quickdash", workspaceId, "context"],
			}),
	});

	return (
		<>
			{site ? (
				<a
					href={site}
					target="_blank"
					rel="noreferrer"
					className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-[12.5px] text-[var(--ink-70)] no-underline transition-colors hover:bg-[rgb(var(--console-ink)/0.06)] hover:text-[var(--ink-90)]"
				>
					<ArrowSquareOutIcon
						size={15}
						className="shrink-0 text-[var(--ink-40)]"
					/>
					<span className="min-w-0 flex-1 truncate">Visit your site</span>
				</a>
			) : (
				/* 🔴 No address, no link. A "visit" that goes nowhere is worse than
			   saying where to put one. */
				<p className="px-2 py-2 text-[11.5px] text-[var(--ink-35)] leading-5">
					No website address yet. Add one in Settings under Branding and it
					appears here.
				</p>
			)}

			<div className="my-1 h-px bg-[var(--console-line-soft)]" />

			<div className="flex items-start justify-between gap-3 px-2 py-2">
				<div className="min-w-0">
					<p className="text-[12.5px] text-[var(--ink-85)]">
						{published ? "Open for business" : "Closed for maintenance"}
					</p>
					<p className="mt-0.5 text-[11px] text-[var(--ink-30)] leading-4">
						{published
							? "Anybody can buy from your site."
							: "Visitors are turned away. Nothing else changes."}
					</p>
				</div>
				<button
					type="button"
					role="switch"
					aria-checked={published}
					aria-label="Shop open"
					disabled={setPublished.isPending}
					onClick={() => setPublished.mutate(!published)}
					className={`relative mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors disabled:opacity-40 ${
						published
							? "bg-[rgb(var(--console-ink))]"
							: "bg-[rgb(var(--console-ink)/0.14)]"
					}`}
				>
					<span
						aria-hidden="true"
						className={`size-4 rounded-full bg-[var(--console-pop)] shadow-[0_1px_2px_rgb(0_0_0/0.3)] transition-transform ${
							published ? "translate-x-4" : "translate-x-0"
						}`}
					/>
				</button>
			</div>

			{failure ? (
				<WriteFailure error={failure.error} message={failure.fallback} />
			) : null}
		</>
	);
}
