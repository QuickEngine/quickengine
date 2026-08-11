import { createFileRoute } from "@tanstack/react-router";
import { TextPage, TextSection, textProse } from "@/components/text-page";

/**
 * Community.
 *
 * ⚠️ STUBBED ON PURPOSE, 2026-08-10. The Discord exists as a decision, not as a
 * server — there is no invite link yet. When there is, replace the section below
 * with the invite and nothing else needs to change.
 *
 * 🔴 Do NOT add an invite that goes nowhere, a member count, or "join hundreds
 * of developers". An empty room somebody was invited to is worse than a page
 * that said honestly it was not open yet.
 *
 * The previous version listed Discord, GitHub Discussions and a community forum
 * as though all three were live. None were.
 */
function CommunityPage() {
	return (
		<TextPage
			title="Somewhere to ask things out loud."
			lede="A Discord is coming, for the questions that are not worth an email and the answers worth other people seeing."
		>
			<TextSection title="Not open yet">
				<div className={textProse}>
					<p>
						We would rather open it when there is somebody in it to answer you.
						An empty server you were invited to is a worse first impression than
						no server at all.
					</p>
					<p>
						It will be linked here the day it opens. Nothing else will be
						required, no application, no waitlist.
					</p>
				</div>
			</TextSection>

			<TextSection title="Until then">
				<div className={textProse}>
					<p>
						<a href="/contact">Email us</a>. It reaches the two people who build
						QuickDash, and right now that is a faster answer than any community
						would give you.
					</p>
					<p>
						If you want to be told when the Discord opens, say so in that
						message and we will come back to you.
					</p>
				</div>
			</TextSection>
		</TextPage>
	);
}

export const Route = createFileRoute("/community")({
	component: CommunityPage,
});
