import { createFileRoute } from "@tanstack/react-router";
import { TextPage, TextSection, textProse } from "@/components/text-page";

/**
 * Workspaces.
 *
 * ⚠️ A workspace is a real boundary in the product, not a marketing idea: it is
 * the tenant. Every isolation guarantee on `/security` is stated per workspace,
 * and `businessType` is a column on it. Keep this page accurate to that.
 */
function WorkspacesPage() {
	return (
		<TextPage
			title="One workspace per business."
			lede="A workspace is the boundary everything else lives inside: its own data, its own modules, its own keys. Run as many as you have businesses."
		>
			<TextSection title="What a workspace is">
				<div className={textProse}>
					<p>
						It is the tenant. Your clients, orders, invoices, files and settings
						belong to exactly one, and nothing crosses between them, not by
						convention, but because the API refuses it and a test proves that on
						every build.
					</p>
					<p>
						One account can own several. A person running a shop and doing
						consulting on the side keeps them completely separate, and switches
						between them without signing out.
					</p>
				</div>
			</TextSection>

			<TextSection title="The business type">
				<div className={textProse}>
					<p>
						You pick the closest match when you create it. That decides which
						modules start switched on and how a few defaults are set, and
						nothing else. It is not a plan, not a limit, and not permanent.
					</p>
					<p>
						Switch modules on and off afterwards. A workspace that ends up
						looking like nothing on <a href="/business">the business list</a> is
						a normal outcome, not a misconfiguration.
					</p>
				</div>
			</TextSection>

			<TextSection title="People and roles">
				<div className={textProse}>
					<p>
						Invite people into a workspace and give them a role you define
						yourself, any name, any set of permissions. There are no fixed
						Admin, Editor and Viewer tiers to squeeze your team into.
					</p>
					<p>
						Permissions are enforced by the API rather than by hiding buttons,
						so a role means the same thing whether somebody is using the
						dashboard, the SDK, or a key you issued.
					</p>
				</div>
			</TextSection>

			<TextSection title="Keys belong to the workspace">
				<div className={textProse}>
					<p>
						A site key is scoped to one workspace and locked to the origins you
						register, which is what makes it safe to ship in page source. A
						server key carries only the permissions you grant it.
					</p>
					<p>
						Revoke either without touching the other, and without affecting
						another workspace you own.
					</p>
				</div>
			</TextSection>

			<TextSection title="Leaving with your data">
				<div className={textProse}>
					<p>
						It is Postgres, and it is exportable. Leaving is a supported
						operation rather than a support ticket you have to fight, and we
						would rather earn the next month than trap you into it.
					</p>
				</div>
			</TextSection>
		</TextPage>
	);
}

export const Route = createFileRoute("/products/workspaces")({
	component: WorkspacesPage,
});
