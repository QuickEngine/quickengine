import type { Metadata } from "next";

export const metadata: Metadata = { title: "Checkout Canceled" };

export default function CheckoutCancelPage() {
	return (
		<main className="grid min-h-dvh place-items-center bg-background text-foreground">
			<div className="max-w-md space-y-2 px-6 text-center">
				<h1 className="font-semibold text-xl tracking-tight">
					Checkout canceled
				</h1>
				<p className="text-muted-foreground text-sm">
					No payment was taken. You can try again anytime.
				</p>
				<a className="text-sm underline" href="/">
					Back home
				</a>
			</div>
		</main>
	);
}
