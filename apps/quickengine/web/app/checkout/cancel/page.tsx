export default function CheckoutCancelPage() {
	return (
		<main className="checkout-status-page">
			<section className="checkout-status-page__content">
				<p className="section-eyebrow">Checkout</p>
				<h1 className="section-title">Checkout canceled.</h1>
				<p className="section-copy">
					No test subscription was created. You can return to the site and try
					the Stripe checkout flow again.
				</p>
				<a className="hero-section__action" href="/">
					Back Home
				</a>
			</section>
		</main>
	);
}
