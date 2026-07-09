import type { Metadata } from "next";

export const metadata: Metadata = { title: "Checkout Complete" };

export default function CheckoutSuccessPage() {
	return (
		<main className="grid min-h-dvh place-items-center bg-background text-foreground">
			<div className="max-w-md space-y-2 px-6 text-center">
				<h1 className="font-semibold text-xl tracking-tight">
					Payment received
				</h1>
				<p className="text-muted-foreground text-sm">
					Stripe has your payment. Your subscription updates as soon as the
					webhook is processed.
				</p>
				<a className="text-sm underline" href="/">
					Back home
				</a>
			</div>
		</main>
	);
}
