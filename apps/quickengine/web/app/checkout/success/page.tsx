export default function CheckoutSuccessPage() {
	return (
		<main className="checkout-status-page">
			<section className="checkout-status-page__content">
				<p className="section-eyebrow">Checkout</p>
				<h1 className="section-title">Subscription test complete.</h1>
				<p className="section-copy">
					Stripe returned a successful test checkout. Once auth is wired, this
					page will update the signed-in QuickEngine account.
				</p>
				<a className="hero-section__action" href="/">
					Back Home
				</a>
			</section>
		</main>
	);
}
