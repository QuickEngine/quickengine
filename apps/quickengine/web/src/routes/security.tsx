import { createFileRoute } from "@tanstack/react-router";
import { TextPage, TextSection, textProse } from "@/components/text-page";

/**
 * Security.
 *
 * 🔴 EVERY CLAIM ON THIS PAGE IS SHIPPED AND TRUE TODAY. Nothing here is
 * aspirational, and nothing describes work that is planned.
 *
 * A security page is the single worst place to describe intent, because it is
 * read by exactly the people who will check, and because a customer who chose us
 * on the strength of a sentence here has a real grievance if it turns out to
 * have been a roadmap item.
 *
 * ⚠️ The "What we do not have yet" section is load-bearing and must NOT be
 * removed to make the page look stronger. SOC 2, ISO 27001 and a third-party
 * penetration test do not exist. Saying so is what makes the rest believable —
 * and quietly dropping it while a buyer's checklist assumes otherwise is the
 * kind of omission that ends a deal or a relationship.
 *
 * Before adding anything: is it deployed, and could you show it to somebody
 * today? If not, it does not go on this page.
 */
function SecurityPage() {
	return (
		<TextPage
			title="Security, as a build decision."
			lede="Your orders, your customers and your money live here. This is what we actually do about that, and what we have not done yet."
		>
			<TextSection title="Isolation you can check">
				<div className={textProse}>
					<p>
						Every workspace is sealed from every other. That is enforced in the
						API rather than left to a query somewhere remembering a filter.
					</p>
					<p>
						It is also proven on every build. Our test suite walks the real
						registered route table and attacks each endpoint with another
						tenant's credentials, deliberately combined in invalid ways: a
						customer session from a different business, a server credential in a
						storefront channel, an API key paired with somebody else's
						workspace. Any route that returns a successful response across one
						of those boundaries fails the build.
					</p>
					<p>
						Because it walks the route table rather than a list, that includes
						routes written years from now.
					</p>
				</div>
			</TextSection>

			<TextSection title="Writes that cannot half-happen">
				<div className={textProse}>
					<p>
						A write commits your data, its idempotency key, its audit entry and
						its outbound event in one database transaction. Either all of it
						happened or none of it did.
					</p>
					<p>
						A retried request replays rather than duplicating. A double-tapped
						button cannot become two orders, and a webhook a provider sends
						twice cannot take payment twice.
					</p>
				</div>
			</TextSection>

			<TextSection title="Credentials and secrets">
				<div className={textProse}>
					<p>
						Provider tokens and connected-account credentials are encrypted at
						rest in the database.
					</p>
					<p>
						Raw exception text and message bodies never reach our logs or our
						error reporting. Failures are recorded by type, because the fastest
						way to leak a credential is to log the error that contained it.
					</p>
					<p>
						Revoking a session takes effect immediately rather than at the end
						of its lifetime.
					</p>
				</div>
			</TextSection>

			<TextSection title="Anything that leaves our network">
				<div className={textProse}>
					<p>
						Outbound webhooks are signed, so you can verify a delivery genuinely
						came from us, and carry the identifiers you need to reject one you
						have already handled.
					</p>
					<p>
						A webhook address is validated when you register it and resolved
						again immediately before every delivery. Local, private, reserved
						and cloud-metadata destinations are refused, the connection is
						pinned to the address that passed the check, and a redirect cannot
						move the request somewhere unverified.
					</p>
				</div>
			</TextSection>

			<TextSection title="In your browser">
				<div className={textProse}>
					<p>
						Every surface we deploy sends an enforced content security policy,
						anti-framing protection, HTTPS persistence, conservative permissions
						and resource-isolation headers. A new surface that omits them fails
						CI rather than shipping.
					</p>
					<p>
						API responses are non-cacheable and deny-all by default, so nothing
						belonging to one account can be served from a shared cache to
						another.
					</p>
				</div>
			</TextSection>

			<TextSection title="How the code gets here">
				<div className={textProse}>
					<p>
						Static security analysis runs on every pull request, every update to
						the main branch, and on a weekly schedule. Every third-party CI
						action is pinned to an exact reviewed revision rather than a tag
						that can be moved under us.
					</p>
					<p>
						Dependency advisories are kept at zero in the production set, and
						anything unresolved is recorded openly rather than waved through.
					</p>
				</div>
			</TextSection>

			<TextSection title="When something goes wrong">
				<div className={textProse}>
					<p>
						We keep a written incident procedure covering severity, ownership,
						evidence preservation, containment, credential and provider
						compromise, recovery, and what we tell you and when.
					</p>
					<p>
						It exists because the middle of an incident is the worst possible
						time to decide who does what.
					</p>
				</div>
			</TextSection>

			<TextSection title="What we do not have yet">
				<div className={textProse}>
					<p>
						We are pre-launch and a two-person company, and there are things a
						larger vendor would already have.
					</p>
					<ul>
						<li>
							<strong>No SOC 2 or ISO 27001.</strong> Neither has been started.
						</li>
						<li>
							<strong>No third-party penetration test.</strong> The adversarial
							testing described above is ours, not an independent auditor's.
						</li>
						<li>
							<strong>No contractual uptime guarantee.</strong> Live status is
							published, but there is no SLA behind it yet.
						</li>
					</ul>
					<p>
						If your procurement process requires any of those today, we are not
						the right fit yet, and we would rather tell you now than during a
						review.
					</p>
				</div>
			</TextSection>

			<TextSection title="Reporting something">
				<div className={textProse}>
					<p>
						If you find a vulnerability, email{" "}
						<a href="mailto:quickenginesw@gmail.com">quickenginesw@gmail.com</a>{" "}
						with enough detail to reproduce it. It reaches the people who wrote
						the code.
					</p>
					<p>
						We will confirm receipt, tell you what we found, and credit you if
						you want to be credited. Please give us a reasonable window to fix
						it before publishing.
					</p>
				</div>
			</TextSection>
		</TextPage>
	);
}

export const Route = createFileRoute("/security")({
	component: SecurityPage,
});
