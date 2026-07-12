import { buildMetadata } from "@/app/_lib/seo";
import { LegalPage, legalTable } from "../_components/legal";

export const metadata = buildMetadata({
	title: "Cookie Policy",
	description: "QuickEngine Cookie Policy — how and why we use cookies.",
	path: "/cookies",
});

export default function CookiesPage() {
	return (
		<LegalPage title="Cookie Policy" updated="July 2026">
			<h2>1. What This Policy Covers</h2>
			<p>
				This Cookie Policy explains how QuickEngine Software (“QuickEngine,”
				“we,” “us,” or “our”) uses cookies and similar technologies (such as
				local storage) across QuickDash and any related services (the
				“Service”). It should be read alongside the{" "}
				<a href="/privacy">Privacy Policy</a>.
			</p>

			<h2>2. What Cookies Are</h2>
			<p>
				Cookies are small text files stored on your device when you visit a
				website or use a web application. They allow a site to recognize your
				device across requests, which is what makes it possible to stay signed
				in, remember settings, or keep a session active.
			</p>

			<h2>3. Categories of Cookies We Use</h2>
			<div className={legalTable}>
				<table className="w-full border-collapse text-muted-foreground text-sm">
					<thead>
						<tr>
							<th>Category</th>
							<th>Purpose</th>
							<th>Can It Be Disabled</th>
						</tr>
					</thead>
					<tbody>
						<tr>
							<td className="text-foreground">Strictly necessary</td>
							<td>
								Authentication and session management via Better Auth, keeping
								you signed in, protecting against cross-site request forgery
							</td>
							<td>
								No. These are required for the Service to function and cannot be
								disabled while using QuickDash.
							</td>
						</tr>
						<tr>
							<td className="text-foreground">Functional</td>
							<td>Remembering workspace preferences and display settings</td>
							<td>
								These support a better experience but are not strictly required.
							</td>
						</tr>
						<tr>
							<td className="text-foreground">Analytics</td>
							<td>
								Understanding how the Service is used in aggregate, to guide
								product decisions
							</td>
							<td>
								Where used, consent will be requested for EU/UK users before
								analytics cookies are set.
							</td>
						</tr>
						<tr>
							<td className="text-foreground">Marketing</td>
							<td>Not currently used inside the Service</td>
							<td>
								Not applicable today. QuickDash does not show advertising or use
								marketing cookies inside the product itself.
							</td>
						</tr>
					</tbody>
				</table>
			</div>
			<p className="italic">
				Placeholder: specific analytics tooling has not been finalized yet. This
				table will be updated with the exact provider and cookie names once one
				is selected.
			</p>

			<h2>4. Third-Party Cookies</h2>
			<p>
				Some cookies may be set by third-party providers used to operate the
				Service, such as our authentication and payment providers, rather than
				by QuickEngine directly. These providers’ own privacy and cookie
				practices apply to the cookies they set, in addition to this policy.
			</p>

			<h2>5. Managing Cookies</h2>
			<p>
				Most browsers allow you to control cookies through their settings,
				including blocking or deleting them. Blocking strictly necessary cookies
				will likely prevent you from being able to sign in or use core features
				of QuickDash. Where consent is required for non-essential cookies, you
				will be able to manage your preferences through a cookie consent tool on
				the Service.
			</p>

			<h2>6. Changes to This Policy</h2>
			<p>
				This policy will be updated whenever the cookies or similar technologies
				used by the Service change, including any future addition of analytics
				or marketing tools. Material changes will be communicated through the
				Service or by email, with reasonable advance notice where practical.
			</p>

			<h2>7. Contact</h2>
			<p>
				Questions about this Cookie Policy can be directed to the support
				contact listed on the QuickEngine Software website.
			</p>
		</LegalPage>
	);
}
