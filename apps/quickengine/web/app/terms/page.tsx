import type { Metadata } from "next";
import { LegalPage } from "../_components/legal";

export const metadata: Metadata = { title: "Terms of Service" };

export default function TermsPage() {
	return (
		<LegalPage title="Terms of Service" updated="July 2026">
			<h2>1. Agreement to Terms</h2>
			<p>
				These Terms of Service (“Terms”) govern access to and use of QuickDash
				and any related services (collectively, the “Service”) provided by
				QuickEngine Software, a general partnership organized under the laws of
				Alberta, Canada (“QuickEngine,” “we,” “us,” or “our”). By creating a
				QuickEngine account, accessing, or using the Service, you (“you” or
				“User”) agree to be bound by these Terms. If you do not agree, do not
				use the Service.
			</p>
			<p>
				If you are using the Service on behalf of a business or another entity,
				you represent that you have the authority to bind that entity to these
				Terms, and “you” refers to both you and that entity.
			</p>

			<h2>2. Description of the Services</h2>
			<p>
				QuickDash is a modular business backend as a service, accessed through a
				dashboard interface, an API, or both. A QuickEngine account may be used
				to create one or more “workspaces,” each configured for a specific
				business type through a set of modular features (“Modules”). QuickEngine
				reserves the right to add, modify, or remove Modules, workspace types,
				and features at its discretion, including as part of ongoing
				development.
			</p>
			<p>
				Some Modules and workspace capacities are available only on certain
				subscription tiers, as described in Section 5.
			</p>

			<h2>3. Accounts</h2>
			<ul>
				<li>
					You must provide accurate, current information when creating an
					account and keep it up to date.
				</li>
				<li>
					You are responsible for maintaining the confidentiality of your
					account credentials and for all activity that occurs under your
					account.
				</li>
				<li>
					You must notify us promptly of any unauthorized use of your account.
				</li>
				<li>
					You must be at least the age of majority in your jurisdiction to
					create an account. The Service is not directed at children and is not
					intended for use by anyone under that age.
				</li>
				<li>
					One QuickEngine account may be used to access QuickDash and any other
					current or future QuickEngine products under a single sign-on system.
				</li>
			</ul>

			<h2>4. Workspace and Modules</h2>
			<p>
				Each workspace is scoped to the business type selected at setup.
				QuickEngine does not guarantee that any specific Module will be
				available indefinitely, but will make reasonable efforts to provide
				notice before removing a Module that is actively in use on a paid tier.
			</p>
			<p>
				Workspaces may be optionally connected to a user-supplied GitHub
				repository and accessed via API keys for the purpose of building a
				custom frontend against the backend. Users are solely responsible for
				the security of their own repositories, API keys, and any custom
				frontend they build, and for complying with these Terms in how that
				custom frontend uses the Service.
			</p>

			<h2>5. Subscriptions, Billing, and Usage</h2>
			<p>
				The Service is offered under a tiered subscription model (currently
				including Free, Starter, Pro, Growth, and Team tiers, plus custom
				Enterprise arrangements), as described at checkout and in your account
				settings. Pricing, included usage, and tier features are subject to
				change with reasonable advance notice for existing subscribers.
			</p>
			<ul>
				<li>
					Paid subscriptions are billed monthly or annually, as selected at
					signup, through our payment processor, Stripe.
				</li>
				<li>
					Usage beyond a plan’s included allowance (“Actions,” storage or seats,
					as applicable) may be billed as additional usage, as described in your
					plan details.
				</li>
				<li>
					You authorize us and our payment processor to charge your selected
					payment method on a recurring basis until you cancel.
				</li>
				<li>
					You are responsible for all applicable taxes associated with your
					subscription.
				</li>
				<li>
					Failure to pay may result in suspension or downgrade of your account,
					with notice provided where reasonably possible.
				</li>
			</ul>
			<p>
				Refunds and cancellations are governed by the separate Refund and
				Cancellation Policy.
			</p>

			<h2>6. Acceptable Use</h2>
			<p>You agree not to:</p>
			<ul>
				<li>
					Use the Service for any unlawful purpose or in violation of any
					applicable law or regulation;
				</li>
				<li>
					Attempt to gain unauthorized access to any other user’s workspace,
					account, or data;
				</li>
				<li>
					Interfere with or disrupt the integrity or performance of the Service,
					including through excessive automated requests inconsistent with
					normal use;
				</li>
				<li>
					Reverse engineer, decompile, or attempt to extract the source code of
					the Service, except where applicable law permits;
				</li>
				<li>
					Use the Service to build a product that directly competes with
					QuickDash using access obtained through a QuickEngine account, without
					our prior written consent;
				</li>
				<li>
					Upload or process content through the Service that is unlawful,
					infringing, or that you do not have the right to use.
				</li>
			</ul>

			<h2>7. Data and Consent Ownership</h2>
			<p>
				As between you and QuickEngine, you retain ownership of the data and
				consent you input into your workspace (“User Content”). You grant
				QuickEngine a limited license to host, process, and transmit User
				Content solely as necessary to provide and improve the Service.
			</p>
			<p>
				QuickEngine retains all rights in the Service itself, including the
				underlying software, Module system, design, and QuickEngine and
				QuickDash trademarks and branding. Nothing in these Terms transfers
				ownership of the Service or its underlying technology to you.
			</p>
			<p>
				Details on how personal data is collected, used, and protected are set
				out in our <a href="/privacy">Privacy Policy</a>.
			</p>

			<h2>8. Third-Party Services</h2>
			<p>
				The Service relies on third-party infrastructure providers (including,
				among others, hosting, database, payment processing, and communications
				providers) to operate. QuickEngine is not responsible for outages,
				errors, or issues caused by the failures of a third-party provider,
				though we will make reasonable efforts to maintain service continually
				and communicate material disruptions.
			</p>

			<h2>9. Termination</h2>
			<p>
				You may cancel your account at any time through your account settings.
				QuickEngine may suspend or terminate your access to the Service if you
				violate these Terms, fail to pay applicable fees, or engage in conduct
				that we reasonably believe harms the Service, other users, or
				QuickEngine.
			</p>

			<h2>10. Disclaimers</h2>
			<p>
				The Service is provided “as is” and “as available,” without warranties
				of any kind, whether express or implied, including implied warranties of
				merchantability, fitness for a particular purpose, or non-infringement,
				to the maximum extent permitted by applicable law. QuickEngine does not
				warrant that the Service will be uninterrupted, error-free, or secure
				against all possible threats.
			</p>

			<h2>11. Limitation of Liability</h2>
			<p>
				To the maximum extent permitted by applicable law, QuickEngine and its
				founders will not be liable for any indirect, incidental, special,
				consequential, or punitive damages, or any loss of profits, revenue,
				data, or business opportunity, arising out of or related to your use of
				the Service. QuickEngine’s total liability for any claim arising out of
				or related to these Terms or the Service will not exceed the amount you
				paid to QuickEngine in the twelve months preceding the claim.
			</p>
			<p>
				Nothing in these Terms limits liability where such limitation is not
				permitted under applicable law.
			</p>

			<h2>12. Changes to These Terms</h2>
			<p>
				QuickEngine may update these Terms from time to time. Material changes
				will be communicated through the Service or by email to the address
				associated with your account, with reasonable advance notice where
				practical. Continued use of the Service after changes take effect
				constitutes acceptance of the updated Terms.
			</p>

			<h2>13. Governing Law</h2>
			<p>
				These Terms are governed by the laws of the Province of Alberta and the
				federal laws of Canada applicable therein, without regard to conflict of
				law principles.
			</p>

			<h2>14. Contact</h2>
			<p>
				Questions about these Terms can be directed to the support contact
				listed on the QuickEngine Software website.
			</p>
		</LegalPage>
	);
}
