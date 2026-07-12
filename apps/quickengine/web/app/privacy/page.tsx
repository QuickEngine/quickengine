import { buildMetadata } from "@/app/_lib/seo";
import { LegalPage, legalTable } from "../_components/legal";

export const metadata = buildMetadata({
	title: "Privacy Policy",
	description:
		"QuickEngine Privacy Policy — how we collect, use, and protect your data.",
	path: "/privacy",
});

export default function PrivacyPage() {
	return (
		<LegalPage title="Privacy Policy" updated="July 2026">
			<h2>1. Who This Policy Covers</h2>
			<p>
				This Privacy Policy explains how QuickEngine Software, a general
				partnership organized under the laws of Alberta, Canada (“QuickEngine,”
				“we,” “us,” or “our”), collects, uses, and protects personal data in
				connection with QuickDash and any related services (the “Service”).
			</p>
			<p>
				This policy covers two different kinds of data, which are treated
				differently:
			</p>
			<ul>
				<li>
					Account data belonging to the person or business who signs up for
					QuickEngine directly (the “Account Holder”). QuickEngine is the data
					controller for this data.
				</li>
				<li>
					End-customer data that an Account Holder’s own customers or clients
					enter into a workspace (for example, a massage client’s appointment
					details, or a knitting customer’s order history). The Account Holder
					is the data controller for this data, and QuickEngine acts as a data
					processor on the Account Holder’s behalf. Account Holders are
					responsible for having their own lawful basis and their own privacy
					notice for their end customers.
				</li>
			</ul>

			<h2>2. Information We Collect</h2>
			<div className={legalTable}>
				<table className="w-full border-collapse text-muted-foreground text-sm">
					<thead>
						<tr>
							<th>Category</th>
							<th>Examples</th>
						</tr>
					</thead>
					<tbody>
						<tr>
							<td className="text-foreground">Account information</td>
							<td>
								Name, email address, password (hashed), OAuth identity if you
								sign up via Google or GitHub
							</td>
						</tr>
						<tr>
							<td className="text-foreground">Billing information</td>
							<td>
								Billing address and payment details, processed directly by
								Stripe; QuickEngine does not store full payment card numbers
							</td>
						</tr>
						<tr>
							<td className="text-foreground">Workspace and usage data</td>
							<td>
								Data you enter into your workspace, which Modules are enabled,
								metered usage such as actions taken and storage consumed
							</td>
						</tr>
						<tr>
							<td className="text-foreground">Technical data</td>
							<td>
								IP address, browser type, device information, log data,
								collected automatically through use of the Service
							</td>
						</tr>
						<tr>
							<td className="text-foreground">Communications</td>
							<td>
								Support requests, emails, and messages sent to QuickEngine
							</td>
						</tr>
					</tbody>
				</table>
			</div>

			<h2>3. How We Use Information</h2>
			<ul>
				<li>To provide, maintain, and improve the Service</li>
				<li>To process payments and manage subscriptions</li>
				<li>To enforce tier limits and usage metering</li>
				<li>
					To communicate with you about your account, security, or changes to
					the Service
				</li>
				<li>To provide customer support</li>
				<li>
					To detect, prevent, and address fraud, abuse, or security issues
				</li>
				<li>To comply with legal obligations</li>
			</ul>
			<p>
				We do not sell personal data. We do not show advertising inside the
				Service or use Account Holder or end-customer data to serve ads.
			</p>

			<h2>4. Legal Basis for Processing (EU/UK Users)</h2>
			<p>
				Where applicable data protection law requires a legal basis for
				processing, QuickEngine relies on the following:
			</p>
			<ul>
				<li>
					Performance of a contract, to provide the Service you’ve signed up for
				</li>
				<li>
					Legitimate interests, to maintain and secure the Service, prevent
					fraud, and improve our product
				</li>
				<li>
					Consent, where required, for example for optional marketing
					communications
				</li>
				<li>
					Legal obligation, where processing is required to comply with
					applicable law
				</li>
			</ul>

			<h2>5. Third-Party Service Providers</h2>
			<p>
				QuickEngine uses the following categories of third-party providers to
				operate the Service. Each processes data only as necessary to perform
				its function.
			</p>
			<ul>
				<li>
					Hosting and infrastructure (Vercel, Neon for database, Redis/Upstash
					for caching)
				</li>
				<li>Authentication (Better Auth, Google OAuth, GitHub OAuth)</li>
				<li>Payment processor (Stripe)</li>
				<li>Media and file storage (Cloudinary, Vercel Blob)</li>
				<li>Search (Algolia)</li>
				<li>Error monitoring (Sentry)</li>
				<li>Real-time features (Pusher)</li>
				<li>Background processing (Inngest)</li>
			</ul>
			<p>
				A current list of subprocessors is maintained and available on request.
			</p>

			<h2>6. International Data Transfers</h2>
			<p>
				QuickEngine’s infrastructure providers may process and store data
				outside of your country of residence, including the United States. Where
				personal data is transferred internationally, QuickEngine relies on the
				safeguards made available by its providers (such as standard contractual
				clauses, where applicable) to protect that data consistent with
				applicable law.
			</p>

			<h2>7. Data Retention</h2>
			<p>
				Account data is retained for as long as your account is active.
				Following account deletion, data is deleted or anonymized within a
				reasonable period, except where retention is required to comply with
				legal, tax, or accounting obligations, or to resolve disputes.
			</p>

			<h2>8. Your Rights</h2>
			<p>
				Depending on your location, you may have rights to access, correct,
				delete, restrict, or port your personal data, and to object to certain
				processing. EU and UK residents have these rights under the GDPR and UK
				GDPR respectively. Canadian residents have related rights under PIPEDA.
				To exercise these rights, contact us using the details in Section 12.
			</p>
			<p>
				If you are an end customer of one of our Account Holders’ workspaces,
				requests about your personal data should be directed to that Account
				Holder first, since they control that data. QuickEngine will assist
				Account Holders in responding to such requests as required by applicable
				law.
			</p>

			<h2>9. Cookies and Similar Technologies</h2>
			<p>
				QuickEngine uses cookies and similar technologies necessary for
				authentication and core functionality of the Service, and may use
				additional cookies for analytics with appropriate consent where required
				by law. See our <a href="/cookies">Cookie Policy</a> for details.
			</p>

			<h2>10. Children’s Privacy</h2>
			<p>
				The Service is not directed at children and is not intended for use by
				anyone under the age of majority in their jurisdiction. QuickEngine does
				not knowingly collect personal data from children.
			</p>

			<h2>11. Security</h2>
			<p>
				QuickEngine uses reasonable technical and organizational measures,
				including encryption in transit, access controls, and monitoring through
				Sentry, to protect personal data. No method of transmission or storage
				is completely secure, and QuickEngine cannot guarantee absolute
				security.
			</p>

			<h2>12. Contact and Changes</h2>
			<p>
				Questions about this Privacy Policy, or requests relating to your
				personal data, can be directed to the support contact listed on the
				QuickEngine Software website. Material changes to this policy will be
				communicated through the Service or email, with reasonable advance
				notice where practical.
			</p>
		</LegalPage>
	);
}
