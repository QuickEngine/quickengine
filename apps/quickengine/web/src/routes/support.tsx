import { STATUS_URL } from "@quickengine/ui";
import { createFileRoute } from "@tanstack/react-router";
import { TextPage, TextSection, textProse } from "@/components/text-page";

/**
 * Support.
 *
 * ⚠️ The previous version was a grid of six "help centre" topic cards — Getting
 * started, Account & billing, Modules, API & SDKs, Workspaces, Troubleshooting —
 * and every one of them linked to `/docs`. Six doors into the same room, and a
 * help centre that does not exist.
 *
 * What a two-person company can honestly offer is an email address and a
 * truthful response time, so that is what this says.
 */
function SupportPage() {
	return (
		<TextPage
			title="Talk to the people who built it."
			lede="There is no support tier, no ticket queue and no chatbot. You email us and one of the two people who wrote the code answers."
		>
			<TextSection title="Getting help">
				<div className={textProse}>
					<p>
						Email{" "}
						<a href="mailto:quickenginesw@gmail.com">quickenginesw@gmail.com</a>{" "}
						or use the <a href="/contact">contact form</a>. Both land in the
						same inbox.
					</p>
					<p>
						Include what you were doing and what happened instead. If it
						involves a specific record, the workspace and the identifier saves a
						round trip.
					</p>
					<p>
						We answer everything, usually within a day. There is no separate
						paid support plan, and there is not going to be one.
					</p>
				</div>
			</TextSection>

			<TextSection title="Before you write">
				<div className={textProse}>
					<p>Two things answer most questions faster than we can:</p>
					<ul>
						<li>
							<a href={STATUS_URL} target="_blank" rel="noreferrer">
								Live status
							</a>{" "}
							if something stopped working suddenly, check whether we already
							know.
						</li>
						<li>
							<a href="/docs">The documentation</a>, every API operation is
							listed with what it accepts and returns.
						</li>
					</ul>
				</div>
			</TextSection>

			<TextSection title="Reporting a security issue">
				<div className={textProse}>
					<p>
						Security reports go to the same address, and we would rather have
						them early and wrong than late and right.{" "}
						<a href="/security">Our security page</a> covers what we do and what
						we do not have yet.
					</p>
				</div>
			</TextSection>
		</TextPage>
	);
}

export const Route = createFileRoute("/support")({
	component: SupportPage,
});
