/**
 * The QuickDash preview.
 *
 * Sits low so its top edge is what you see on load and the rest carries on past
 * the fold.
 *
 * ⚠️ The screenshot must be of a workspace containing NOTHING REAL. It is a
 * public marketing page, so anything visible in it — client names, invoice
 * amounts, email addresses — is published. Use a throwaway workspace with
 * invented records, not an operating one.
 *
 * Drop the file at `public/quickdash-preview.png` and it renders; until then the
 * frame stands empty rather than showing a placeholder pretending to be a
 * product.
 */
export function ProductWindow() {
	return (
		<section className="site-gutter">
			<div className="h-[85vh] w-full overflow-hidden rounded-xl border border-edge bg-field">
				<img
					src="/quickdash-preview.png"
					alt="A QuickDash workspace showing the module sidebar and a client record"
					className="size-full object-cover object-left-top"
					/* Capture at 2x so it stays sharp on a retina display — a 1x
					   screenshot scaled up is the fastest way to make a product look
					   cheap on the one page selling it. */
					width={2880}
					height={1800}
					loading="lazy"
					decoding="async"
					onError={(event) => {
						// No file yet: leave the frame empty rather than showing a broken
						// image icon on the marketing page.
						event.currentTarget.style.display = "none";
					}}
				/>
			</div>
		</section>
	);
}
