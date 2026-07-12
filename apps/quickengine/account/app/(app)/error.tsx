"use client";

// In-shell error boundary for account pages — recover without a full reload.
export default function ErrorBoundary({
	reset,
}: {
	error: Error;
	reset: () => void;
}) {
	return (
		<div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
			<h2 className="font-display font-normal text-2xl text-foreground tracking-tight">
				Something went wrong
			</h2>
			<p className="max-w-sm text-muted-foreground text-sm">
				This page ran into an error. Try again, or head back to your workspaces.
			</p>
			<button
				type="button"
				onClick={reset}
				className="rounded-lg bg-foreground px-5 py-2.5 font-medium text-background text-sm transition-opacity hover:opacity-90"
			>
				Try again
			</button>
		</div>
	);
}
