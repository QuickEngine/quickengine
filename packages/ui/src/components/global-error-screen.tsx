"use client";

// Shared last-resort error UI for every app's global-error.tsx. Renders its own
// <html>/<body> with inline styles (the root layout, globals, and fonts aren't
// available when the root itself throws), kept on-brand void-black.
export function GlobalErrorScreen({ reset }: { reset: () => void }) {
	return (
		<html lang="en">
			<body
				style={{
					margin: 0,
					minHeight: "100dvh",
					display: "grid",
					placeItems: "center",
					padding: "2rem",
					background: "#000000",
					color: "#f7fbff",
					fontFamily:
						"ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
				}}
			>
				<div style={{ maxWidth: "24rem", textAlign: "center" }}>
					<p
						style={{
							fontSize: 13,
							letterSpacing: "0.3em",
							color: "rgba(247,251,255,0.5)",
						}}
					>
						500
					</p>
					<h1 style={{ margin: "8px 0 0", fontSize: 22, fontWeight: 500 }}>
						Something went wrong
					</h1>
					<p
						style={{
							margin: "8px 0 0",
							fontSize: 14,
							lineHeight: 1.6,
							color: "rgba(247,251,255,0.5)",
						}}
					>
						An unexpected error occurred. Please try again.
					</p>
					<button
						type="button"
						onClick={reset}
						style={{
							marginTop: 24,
							height: 44,
							width: "100%",
							borderRadius: 8,
							border: "none",
							background: "#ffffff",
							color: "#000000",
							fontSize: 14,
							fontWeight: 500,
							cursor: "pointer",
						}}
					>
						Try again
					</button>
				</div>
			</body>
		</html>
	);
}
