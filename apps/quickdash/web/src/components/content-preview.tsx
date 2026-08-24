import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { workspaceApi } from "../lib/api";

/**
 * The customer's own website, beside the words that produce it.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 *
 * 🔴 Editing content without seeing the page is guesswork. A slot called
 * "Supporting line" in a list of twenty is not a thing anybody can picture, so
 * the only way to know what a change did was to open the site in another tab and
 * refresh it — for every edit. Two people doing that to the same shop is worse
 * again, because neither can tell whose change they are looking at.
 *
 * 🔑 An IFRAME of the real site, not a rendering of it. QuickDash does not know
 * the customer's fonts, layout or CSS and must never pretend to: a mock that
 * drifts from the real page is more dangerous than no preview, because it is
 * believed. The real page cannot drift from itself.
 *
 * ⚠️ Cross-origin ON PURPOSE. The site is the customer's, on their domain, and
 * this frame can read nothing inside it — which is correct, and is why the
 * click-to-edit step needs the site to opt in and speak back over `postMessage`
 * rather than QuickDash reaching into the document.
 */
export function ContentPreview({
	workspaceId,
	reloadToken,
	draft,
	onChoosePageWidth,
	publishedContent,
}: {
	workspaceId: string;
	/** Bumped by the editor after every save, to re-fetch the page. */
	reloadToken: number;
	/**
	 * What is being typed RIGHT NOW, before it is saved.
	 *
	 * 🔑 Pushed into the page so the preview shows the words as they are written,
	 * rather than only after a save. That is the difference between a preview
	 * somebody glances at and one they actually work against.
	 */
	draft?: { key: string; value: string } | null;
	/**
	 * Set how wide the PAGE should be. `null` means "as wide as it will go".
	 *
	 * 🔑 Presets rather than only a drag handle. Dragging to exactly 375px is a
	 * fiddly thing to ask of somebody who just wants to know whether their site
	 * works on a phone, and 375 / 768 are the widths people design against.
	 */
	onChoosePageWidth?: (pageWidth: number | null) => void;
	/**
	 * Every published slot, as QuickDash currently holds it.
	 *
	 * 🔴 Pushed into the page after every save, because reloading the frame is
	 * NOT enough on its own: the site caches its own content fetch, so a reload
	 * re-renders from that cache and the preview shows the old words for up to a
	 * minute after publishing — which reads as the preview being broken when it
	 * is faithfully showing what the site returns.
	 *
	 * ⚠️ These are the values the SERVER stored, read back from the list, never
	 * what was typed into the box. A preview showing something the database does
	 * not hold would be worse than a slow one.
	 */
	publishedContent?: Record<string, unknown>;
}) {
	const frame = useRef<HTMLIFrameElement | null>(null);
	const branding = useQuery({
		queryKey: ["quickdash", workspaceId, "branding"],
		queryFn: async () =>
			(
				await workspaceApi(workspaceId).request<{
					websiteUrl?: string | null;
				}>("/quickdash/branding")
			).data,
	});

	/**
	 * ⚠️ An override, kept in this browser only.
	 *
	 * The stored website URL is the live shop, which is the right default and the
	 * wrong thing while somebody is working against a development copy. Without
	 * this the only way to preview local work would be to change the workspace's
	 * real website address — which is shared, and would point the customer's own
	 * records at `localhost`.
	 */
	const storageKey = `quickdash:preview-url:${workspaceId}`;
	const [override, setOverride] = useState<string>("");
	const [editingUrl, setEditingUrl] = useState(false);

	useEffect(() => {
		try {
			setOverride(window.localStorage.getItem(storageKey) ?? "");
		} catch {
			// Private browsing, or storage disabled. The live URL still works.
		}
	}, [storageKey]);

	const saveOverride = (value: string) => {
		setOverride(value);
		try {
			if (value.trim()) window.localStorage.setItem(storageKey, value.trim());
			else window.localStorage.removeItem(storageKey);
		} catch {}
	};

	/**
	 * How wide the page actually is, in CSS pixels.
	 *
	 * 🔑 The number is the point. Dragging the rail changes the page's width, and
	 * without a readout there is no way to know whether you are looking at a
	 * phone, a tablet or something between — which is the whole reason to drag
	 * it. `375` and `768` are the widths people actually design against.
	 */
	const [frameWidth, setFrameWidth] = useState(0);
	useEffect(() => {
		const node = frame.current;
		if (!node || typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver((entries) => {
			const width = entries[0]?.contentRect.width ?? 0;
			setFrameWidth(Math.round(width));
		});
		observer.observe(node);
		return () => observer.disconnect();
	});

	const target = (override || branding.data?.websiteUrl || "").trim();

	/**
	 * 🔴 `postMessage` with an EXPLICIT target origin, never `"*"`.
	 *
	 * `"*"` delivers the message to whatever document happens to be in the frame
	 * — including one the site redirected to. Naming the origin means a page that
	 * is not the customer's site simply never receives it.
	 *
	 * ⚠️ Sends nothing but the one slot being edited. The frame is another origin
	 * and cannot be trusted with a workspace's whole content map for the sake of
	 * a live preview.
	 */
	const originOf = (url: string): string | null => {
		try {
			return new URL(url).origin;
		} catch {
			return null;
		}
	};

	/**
	 * 🔑 Sent on every change to the saved content, and again whenever the frame
	 * reloads — a page that has just navigated has no memory of an earlier
	 * message, so re-sending is what keeps a reloaded preview current.
	 */
	// biome-ignore lint/correctness/useExhaustiveDependencies: `reloadToken` is a deliberate trigger — the frame reloads, so the message has to be sent again to a page with no memory of the last one
	useEffect(() => {
		if (!publishedContent || !target) return;
		const origin = originOf(target);
		if (!origin) return;
		// A frame that is still loading has no document to receive this. A short
		// delay after the reload token changes is enough, and the site falls back
		// to its own fetch if the message never arrives.
		const timer = window.setTimeout(() => {
			frame.current?.contentWindow?.postMessage(
				{ source: "quickdash", type: "content-map", content: publishedContent },
				origin,
			);
		}, 300);
		return () => window.clearTimeout(timer);
	}, [publishedContent, target, reloadToken]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the draft's identity, which is what changes per keystroke
	useEffect(() => {
		if (!draft || !target) return;
		let origin: string;
		try {
			origin = new URL(target).origin;
		} catch {
			return;
		}
		frame.current?.contentWindow?.postMessage(
			{ source: "quickdash", type: "content-draft", ...draft },
			origin,
		);
	}, [draft?.key, draft?.value, target]);

	/**
	 * 🔑 A changing `src` is what reloads a cross-origin frame.
	 *
	 * `iframe.contentWindow.location.reload()` is blocked by the same-origin
	 * policy, and `key` would rebuild the element and lose the scroll position on
	 * every keystroke elsewhere in the page. A query parameter the site ignores
	 * is the one thing that reliably re-fetches.
	 */
	const src = target
		? `${target}${target.includes("?") ? "&" : "?"}__qd=${reloadToken}`
		: "";

	if (!target) {
		return (
			<div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
				<p className="text-[12.5px] text-[var(--ink-60)]">
					No website address for this workspace yet.
				</p>
				<p className="max-w-[280px] text-[11.5px] text-[var(--ink-30)]">
					Add one in Settings, or point the preview somewhere for now.
				</p>
				<input
					type="url"
					placeholder="http://localhost:3000"
					className="h-8 w-[260px] rounded-full border border-[var(--console-line-strong)] bg-transparent px-3 text-[11.5px] text-[var(--ink-85)] outline-none"
					onKeyDown={(event) => {
						if (event.key === "Enter")
							saveOverride((event.target as HTMLInputElement).value);
					}}
				/>
			</div>
		);
	}

	return (
		<div className="flex h-full flex-col">
			<div className="flex items-center gap-2 border-[var(--console-line-soft)] border-b px-3 py-1.5">
				{editingUrl ? (
					<input
						type="url"
						// Focused on mount via a callback ref rather than `autoFocus`:
						// this input only exists because somebody just clicked to edit
						// the address, so the caret belongs in it.
						ref={(node) => node?.focus()}
						defaultValue={override}
						placeholder={branding.data?.websiteUrl ?? "https://…"}
						className="h-6 flex-1 rounded-full border border-[var(--console-line-strong)] bg-transparent px-2.5 text-[11px] text-[var(--ink-85)] outline-none"
						onBlur={(event) => {
							saveOverride(event.target.value);
							setEditingUrl(false);
						}}
						onKeyDown={(event) => {
							if (event.key === "Enter") event.currentTarget.blur();
							if (event.key === "Escape") setEditingUrl(false);
						}}
					/>
				) : (
					<>
						<button
							type="button"
							className="min-w-0 flex-1 truncate text-left text-[11px] text-[var(--ink-30)] hover:text-[var(--ink-60)]"
							title="Preview a different address"
							onClick={() => setEditingUrl(true)}
						>
							{target}
							{override ? (
								<span className="ml-1.5 text-[10px] text-[#f5b44a]">
									override
								</span>
							) : null}
						</button>
						{onChoosePageWidth ? (
							<span className="flex shrink-0 items-center gap-0.5">
								{(
									[
										["Phone", 375],
										["Tablet", 768],
										["Full", null],
									] as const
								).map(([label, width]) => {
									const active =
										width === null
											? frameWidth >= 1024
											: Math.abs(frameWidth - width) < 24;
									return (
										<button
											key={label}
											type="button"
											onClick={() => onChoosePageWidth(width)}
											className={`rounded-full px-2 py-0.5 text-[10.5px] transition-colors ${
												active
													? "bg-[rgb(var(--console-ink)/0.10)] text-[var(--ink-85)]"
													: "text-[var(--ink-30)] hover:text-[var(--ink-85)]"
											}`}
										>
											{label}
										</button>
									);
								})}
							</span>
						) : null}
						{frameWidth > 0 ? (
							<span
								title="How wide the page is right now — drag the divider to change it"
								className="shrink-0 tabular-nums text-[11px] text-[var(--ink-30)]"
							>
								{frameWidth}px
								<span className="ml-1 text-[var(--ink-25)]">
									{frameWidth < 640
										? "phone"
										: frameWidth < 1024
											? "tablet"
											: "desktop"}
								</span>
							</span>
						) : null}
						<a
							href={target}
							target="_blank"
							rel="noreferrer"
							className="shrink-0 text-[11px] text-[var(--ink-30)] hover:text-[var(--ink-85)]"
						>
							Open ↗
						</a>
					</>
				)}
			</div>
			{/*
			  🔴 `sandbox` without `allow-top-navigation`.

			  The framed page is the customer's, but it is still another origin, and
			  a page that can navigate the TOP window can replace the whole console
			  with anything it likes. Scripts, forms and its own origin are allowed
			  because otherwise it is not the site — it is a screenshot of one.
			*/}
			<iframe
				ref={frame}
				title="Website preview"
				src={src}
				/*
				  🔴 No background of its own.

				  `bg-white` here is what somebody sees when they overscroll the
				  framed page — a white band above or below a dark site, which
				  reads as the preview being broken rather than as the console
				  showing through. Transparent lets the SITE's own background
				  fill that space, which is what the real browser does.
				*/
				className="min-h-0 flex-1 border-0 bg-transparent"
				sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
			/>
		</div>
	);
}
