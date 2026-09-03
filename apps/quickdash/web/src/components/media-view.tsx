import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { workspaceApi } from "../lib/api";
import { type CatalogItem, imagesOf } from "../lib/catalog";
import { ListControls, useChipFilter } from "./list-controls";
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
	url: string;
	itemId: string;
	itemName: string;
	first: boolean;
};

export function MediaView({ workspaceId }: { workspaceId: string }) {
	const statusFilter = useChipFilter();
	const [search, setSearch] = useState("");
	const [copied, setCopied] = useState<string | null>(null);

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
								url,
								itemId: item.id,
								itemName: item.name,
								first: index === 0,
							})),
					);
					const needle = search.trim().toLowerCase();
					const shown = uses.filter(
						(use) =>
							statusFilter.keep(use.first ? "shown first" : "additional") &&
							(!needle || use.itemName.toLowerCase().includes(needle)),
					);

					if (shown.length === 0) {
						return (
							<EmptyState
								title="Nothing matches"
								detail="Try a different search."
							/>
						);
					}

					return (
						<>
							<p className="mb-3 text-[11.5px] text-[var(--ink-30)]">
								{shown.length} {shown.length === 1 ? "picture" : "pictures"} in
								use.{" "}
								<span className="text-[var(--ink-20)]">
									Files no longer attached to anything are not listed yet.
								</span>
							</p>

							<div className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-3">
								{shown.map((use) => (
									<figure
										key={`${use.itemId}-${use.url}`}
										className="overflow-hidden rounded-xl border border-[var(--console-line-soft)]"
									>
										<img
											src={use.url}
											alt=""
											loading="lazy"
											className="aspect-square w-full bg-[rgb(var(--console-ink)/0.03)] object-cover"
										/>
										<figcaption className="flex items-center gap-2 px-2.5 py-2">
											<span className="min-w-0 flex-1 truncate text-[11px] text-[var(--ink-60)]">
												{use.itemName}
												{use.first ? (
													<span className="text-[var(--ink-25)]">
														{" "}
														· shown first
													</span>
												) : null}
											</span>
											{/* Copying the address is the one thing a person comes
											    here to do that nowhere else offers. */}
											<button
												type="button"
												onClick={() => {
													void navigator.clipboard.writeText(use.url);
													setCopied(use.url);
													setTimeout(() => setCopied(null), 1500);
												}}
												className="shrink-0 rounded-full border border-[var(--console-line-strong)] px-2 py-0.5 text-[10.5px] text-[var(--ink-60)] transition-colors hover:text-[var(--ink-90)]"
											>
												{copied === use.url ? "Copied" : "Copy"}
											</button>
										</figcaption>
									</figure>
								))}
							</div>
						</>
					);
				}}
			</PageState>
		</main>
	);
}
