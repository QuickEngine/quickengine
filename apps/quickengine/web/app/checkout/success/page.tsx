export default function CheckoutSuccessPage() {
	return (
		<main className="grid min-h-dvh place-items-center bg-background text-foreground">
			<div className="max-w-md space-y-2 px-6 text-center">
				<h1 className="font-semibold text-xl tracking-tight">
					Payment received
				</h1>
				<p className="text-muted-foreground text-sm">
					Stripe has your payment. Your subscription updates as soon as the
					webhook is processed — head back to the billing console to confirm.
				</p>
				<a className="text-sm underline" href="/dev/billing">
					Back to billing console
				</a>
			</div>
		</main>
	);
}
