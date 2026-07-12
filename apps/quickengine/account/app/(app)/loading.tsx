// In-shell loading skeleton for account pages (renders inside the sidebar/header).
export default function Loading() {
	return (
		<div className="space-y-4 p-6">
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
				{[0, 1, 2, 3].map((i) => (
					<div
						key={i}
						className="h-32 rounded-xl border border-foreground/[0.06] bg-foreground/[0.02] motion-safe:animate-pulse"
					/>
				))}
			</div>
			<div className="h-64 rounded-xl border border-foreground/[0.06] bg-foreground/[0.02] motion-safe:animate-pulse" />
		</div>
	);
}
