import { buildMetadata } from "@/app/_lib/seo";
import { LegalPage } from "../_components/legal";

export const metadata = buildMetadata({
	title: "Refund & Cancellation Policy",
	description:
		"QuickEngine Refund & Cancellation Policy — how billing, refunds, and cancellations work.",
	path: "/refund",
});

// NOTE: unlike Terms / Privacy / Cookies, there is no source draft for this in
// docs/. This is a placeholder authored to match the Terms (Stripe billing,
// cancel-anytime, period-based access) — it needs real refund terms + legal
// review before publication.
export default function RefundPage() {
	return (
		<LegalPage title="Refund & Cancellation Policy" updated="July 2026">
			<h2>1. Overview</h2>
			<p>
				This Refund and Cancellation Policy explains how subscriptions to
				QuickDash and any related services (the “Service”) are cancelled and how
				refunds are handled. It should be read alongside the{" "}
				<a href="/terms">Terms of Service</a>.
			</p>

			<h2>2. Subscriptions and Billing</h2>
			<p>
				Paid subscriptions are billed in advance on a monthly or annual cycle,
				as selected at signup, through our payment processor, Stripe. Your
				subscription renews automatically at the end of each cycle until you
				cancel.
			</p>

			<h2>3. Cancellation</h2>
			<p>
				You may cancel your subscription at any time from your account settings.
				When you cancel, your plan remains active until the end of the current
				paid billing period, and you will not be charged again. QuickEngine does
				not automatically refund the remainder of a period on cancellation,
				except where required by applicable law.
			</p>

			<h2>4. Refunds</h2>
			<p>
				Subscription fees are generally non-refundable, and partial billing
				periods are not refunded, except where a refund is required by
				applicable law or expressly agreed in writing. If you believe you were
				charged in error, contact us and we will review the charge in good
				faith.
			</p>

			<h2>5. Usage-Based Charges</h2>
			<p>
				Charges for usage beyond a plan’s included allowance (such as additional
				actions, storage, or seats) reflect resources already consumed and are
				non-refundable.
			</p>

			<h2>6. Downgrades and Plan Changes</h2>
			<p>
				You may change plans at any time from your account settings. Downgrades
				take effect at the start of the next billing cycle, and any difference
				in price is applied going forward rather than refunded for the current
				period.
			</p>

			<h2>7. Free Tier</h2>
			<p>
				The Free tier carries no charge and therefore no refund. You may stop
				using it or delete your account at any time.
			</p>

			<h2>8. Enterprise</h2>
			<p>
				Enterprise arrangements are governed by the separate agreement entered
				into with QuickEngine, which controls in the event of any conflict with
				this policy.
			</p>

			<h2>9. Contact</h2>
			<p>
				Questions about this policy, or a billing concern, can be directed to
				the support contact listed on the QuickEngine Software website.
			</p>
		</LegalPage>
	);
}
