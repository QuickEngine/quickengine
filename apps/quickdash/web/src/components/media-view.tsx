import { CheckIcon, CopyIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { workspaceApi } from "../lib/api";
import { type CatalogItem, imagesOf } from "../lib/catalog";
import { useListLayout } from "../lib/list-view";
import { ListControls, useChipFilter } from "./list-controls";
import { LayoutToggle, PagedTable } from "./list-layout";
import { EmptyState, PageState } from "./page-state";

/**
 * Every picture this workspace has, in one place.
 *
 * ── Why this is NOT a module ────────────────────────────────────────────────
 *
 * 🔑 A module is something a business can choose not to have. Images are not:
 * Products cannot work without them — a shop with no photographs is not a shop —
 * so putting them behind a separate purchase would leave somebody who bought
 * Products with a half-broken one. Anything whose absence breaks a module the
 * customer already paid for is platform, not product.
 *
 * It is also cross-cutting: product photographs, category tiles, article images
 * and a logo on an invoice are four modules and one pile of files.
 *
 * QuickEngine still earns from it, through STORAGE metering (hard rule 7) —
 * which is the honest way to charge for something that costs real
 * infrastructure, rather than charging to unlock the screen that shows you what
 * you are using.
 *
 * ⚠️ Deliberately NOT the `files` module either. That one holds private
 * documents behind expiring links; this is public and permanent, and
 * `PublicAssetBucket` is a separate store precisely so a signed contract has no
 * route into a public bucket.
 *
 * ── What this is today ──────────────────────────────────────────────────────
 *
 * 🔴 A STUB, and honest about it. It lists images by reading the records that
 * reference them, because there is no asset index yet. That means it can show
 * everything in use and cannot show ORPHANS — files that were uploaded, then
 * removed from their product, and are still being paid for. Finding those needs
 * a `workspace_assets` table recording every write, which is the next slice.
 */

type MediaUse = {
	/** `PagedTable` keys, selects and reorders by this. */
	id: string;
	url: string;
	itemId: string;
	itemName: string;
	first: boolean;
	/** The last path segment, which is the only part anybody reads. */
	filename: string;
};

export function MediaView({ workspaceId }: { workspaceId: string }) {
	const statusFilter = useChipFilter();
	const [search, setSearch] = useState("");
	const [copied, setCopied] = useState<string | null>(null);
	const { layout, setLayout } = useListLayout(workspaceId);

	const catalog = useQuery({
		queryKey: ["quickdash", workspaceId, "catalog"],
		queryFn: async () =>
			(await workspaceApi(workspaceId).catalog.list({ limit: 100 })).data,
	});

	return (
		<main className="min-h-full bg-[var(--console-bg)] px-5 py-5">
			<ListControls
				onClearFilter={() => statusFilter.clear()}
				filter={statusFilter.chips("Use", ["shown first", "additional"])}
				filterCount={statusFilter.count}
				exportRows={() => catalog.data?.items ?? []}
				exportName="media"
				action={<LayoutToggle layout={layout} onChange={setLayout} />}
				query={search}
				onQueryChange={setSearch}
				placeholder="Search by product"
			/>

			<PageState
				query={catalog}
				loadingLabel="Loading media…"
				isEmpty={(data) =>
					(data.items as CatalogItem[]).every(
						(item) => imagesOf(item.metadata).length === 0,
					)
				}
				empty={
					<EmptyState
						title="No pictures yet"
						detail="Images uploaded to a product show up here, so you can see everything this business has in one place. Add one from any product."
					/>
				}
			>
				{(data) => {
					const uses: MediaUse[] = (data.items as CatalogItem[]).flatMap(
						(item) =>
							imagesOf(item.metadata).map((url, index) => ({
								id: `${item.id}-${index}`,
								url,
								itemId: item.id,
								itemName: item.name,
								first: index === 0,
								filename: url.split("/").pop() || url,
							})),
					);
					const needle = search.trim().toLowerCase();
					const shown = uses.filter(
						(use) =>
							statusFilter.keep(use.first ? "shown first" : "additional") &&
							(!needle || use.itemName.toLowerCase().includes(needle)),
					);

					/* Copy is a HOVER CLIPBOARD in the corner, not a button under every
					   tile. A page of forty pictures had forty pill buttons on it, which
					   is a wall of chrome over the thing you came to look at. Same
					   treatment the code blocks on the Developers page got. */
					const copyButton = (url: string) => (
						<button
							type="button"
							aria-label={copied === url ? "Copied" : "Copy the address"}
							data-hint={copied === url ? "Copied" : "Copy the address"}
							onClick={(event) => {
								// The tile itself is not a link, but it will be one day; a
								// copy must never also open something.
								event.stopPropagation();
								void navigator.clipboard.writeText(url);
								setCopied(url);
								setTimeout(() => setCopied(null), 1500);
							}}
							className="flex size-6 items-center justify-center rounded-md text-[var(--ink-30)] transition-colors hover:text-[var(--ink-90)]"
						>
							{copied === url ? (
								<CheckIcon size={12} />
							) : (
								<CopyIcon size={12} />
							)}
						</button>
					);

					return (
						<>
							<p className="mb-3 text-[11.5px] text-[var(--ink-30)]">
								{shown.length} {shown.length === 1 ? "picture" : "pictures"} in
								use.{" "}
								<span className="text-[var(--ink-20)]">
									Files no longer attached to anything are not listed yet.
								</span>
							</p>

							<PagedTable
								workspaceId={workspaceId}
								layout={layout}
								caption="Media"
								rows={shown}
								exportName="media"
								empty={
									<EmptyState
										title="Nothing matches"
										detail="Try a different search, or clear the use filter."
									/>
								}
								/* 🔴 The last page still drawing its own grid. It had flat
								   hairline tiles on the outlet, no view switch, no sort and no
								   paging, because a hand written `<figure>` grid has none of
								   those. The picture is unchanged; the object it sits in is
								   now the console's, exactly like Products. */
								renderCard={(use) => (
									<>
										<img
											src={use.url}
											alt=""
											loading="lazy"
											className="aspect-square w-full rounded-md bg-[rgb(var(--console-ink)/0.03)] object-cover"
										/>
										<div className="mt-2 flex items-center gap-1.5">
											<span className="min-w-0 flex-1 truncate text-[12px] text-[var(--ink-85)]">
												{use.itemName}
											</span>
											{copyButton(use.url)}
										</div>
										{use.first ? (
											<p className="mt-0.5 text-[10.5px] text-[var(--ink-25)]">
												Shown first
											</p>
										) : null}
									</>
								)}
								columns={[
									{
										key: "itemName",
										header: "Picture",
										render: (use) => (
											<span className="flex min-w-0 items-center gap-2.5">
												<img
													src={use.url}
													alt=""
													loading="lazy"
													className="size-8 shrink-0 rounded-md border border-[var(--console-line-soft)] object-cover"
												/>
												<span className="min-w-0 truncate">{use.itemName}</span>
											</span>
										),
									},
									{
										key: "first",
										header: "Use",
										render: (use) =>
											use.first ? (
												"Shown first"
											) : (
												<span className="text-[var(--ink-35)]">Additional</span>
											),
									},
									{
										key: "filename",
										header: "Address",
										render: (use) => (
											<span className="flex min-w-0 items-center gap-1.5">
												<span className="min-w-0 truncate font-mono text-[11px] text-[var(--ink-45)]">
													{use.filename}
												</span>
												{copyButton(use.url)}
											</span>
										),
									},
								]}
							/>
						</>
					);
				}}
			</PageState>
		</main>
	);
}
