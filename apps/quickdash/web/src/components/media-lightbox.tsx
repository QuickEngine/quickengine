import {
	Dialog,
	DialogContent,
	DialogTitle,
} from "@quickengine/ui/components/ui/dialog";
import { useEffect, useState } from "react";

export type LightboxItem = { type: "image" | "video"; url: string };

/**
 * Media, front and centre.
 *
 * 🔴 Built because the console could show a thumbnail and nothing else. A
 * product photograph was 60 pixels square and a video was a still frame, so the
 * only way to check what had actually been uploaded was to open the storefront,
 * or the raw storage url. Somebody publishing a product could not see what they
 * were publishing.
 *
 * ⚠️ The same overlay as the workspace search dialog, deliberately: the console
 * behind stays visible through the glass rather than being replaced. This is a
 * closer look at something on the page, not a different place, and it should
 * feel like leaning in rather than navigating away.
 */
export function MediaLightbox({
	items,
	onClose,
	startAt,
}: {
	items: readonly LightboxItem[];
	/** Null closes it. A number is the index to open on. */
	startAt: number | null;
	onClose: () => void;
}) {
	const open = startAt !== null;
	const [index, setIndex] = useState(startAt ?? 0);

	// Re-open on whichever item was clicked, rather than wherever it was left.
	useEffect(() => {
		if (startAt !== null) setIndex(startAt);
	}, [startAt]);

	const count = items.length;
	const current = items[Math.min(index, Math.max(0, count - 1))];
	const step = (by: number) => setIndex((at) => (at + by + count) % count);

	/**
	 * ⚠️ Arrow keys are handled here rather than on the buttons, because the
	 * thing somebody wants to press after opening a photograph is the arrow key,
	 * and focus is on the dialog rather than on either control.
	 */
	useEffect(() => {
		if (!open || count < 2) return;
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "ArrowRight") step(1);
			if (event.key === "ArrowLeft") step(-1);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	});

	if (!open || !current) return null;

	return (
		<Dialog open onOpenChange={(next) => !next && onClose()}>
			<DialogContent
				className="max-w-[min(92vw,64rem)] gap-0 border-[var(--console-line)] bg-[var(--console-card)] p-3"
				showCloseButton
			>
				<DialogTitle className="sr-only">
					{current.type === "video" ? "Video" : "Photograph"} {index + 1} of{" "}
					{count}
				</DialogTitle>

				<div className="relative flex items-center justify-center rounded-lg bg-[var(--console-line)]">
					{current.type === "video" ? (
						/**
						 * ⚠️ CONTROLS here, unlike every thumbnail. This is the one place
						 * somebody wants to scrub, pause and replay, which is the whole
						 * reason for opening it.
						 *
						 * ⚠️ Not autoplaying. Opening a dialog that immediately makes
						 * noise, or starts a clip somebody wanted to scrub from the
						 * beginning, is worse than one click.
						 */
						// biome-ignore lint/a11y/useMediaCaption: merchant-supplied clip
						<video
							className="max-h-[74vh] w-auto max-w-full rounded-lg"
							controls
							key={current.url}
							playsInline
							preload="metadata"
							src={current.url}
						/>
					) : (
						<img
							alt=""
							className="max-h-[74vh] w-auto max-w-full rounded-lg object-contain"
							src={current.url}
						/>
					)}

					{count > 1 ? (
						<>
							<button
								aria-label="Previous"
								className="-translate-y-1/2 absolute top-1/2 left-2 flex size-8 items-center justify-center rounded-full bg-[rgb(0_0_0/0.55)] text-white text-sm"
								onClick={() => step(-1)}
								type="button"
							>
								‹
							</button>
							<button
								aria-label="Next"
								className="-translate-y-1/2 absolute top-1/2 right-2 flex size-8 items-center justify-center rounded-full bg-[rgb(0_0_0/0.55)] text-white text-sm"
								onClick={() => step(1)}
								type="button"
							>
								›
							</button>
						</>
					) : null}
				</div>

				{/* Only when there is a choice. A strip of one is a control that does
				    nothing. */}
				{count > 1 ? (
					<div className="mt-3 flex flex-wrap gap-2">
						{items.map((entry, at) => (
							<button
								aria-current={at === index}
								aria-label={`${entry.type === "video" ? "Video" : "Photograph"} ${at + 1}`}
								className={`relative size-12 overflow-hidden rounded-md border ${
									at === index
										? "border-[rgb(var(--console-ink)/0.55)]"
										: "border-[var(--console-line-soft)]"
								}`}
								key={entry.url}
								onClick={() => setIndex(at)}
								type="button"
							>
								{entry.type === "video" ? (
									// biome-ignore lint/a11y/useMediaCaption: silent still frame
									<video
										className="size-full object-cover"
										muted
										playsInline
										preload="metadata"
										src={entry.url}
									/>
								) : (
									<img
										alt=""
										className="size-full object-cover"
										src={entry.url}
									/>
								)}
							</button>
						))}
					</div>
				) : null}
			</DialogContent>
		</Dialog>
	);
}
