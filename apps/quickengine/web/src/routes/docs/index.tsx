import { createFileRoute } from "@tanstack/react-router";
import { TextPage, TextSection, textProse } from "@/components/text-page";
import { CARD } from "@/lib/surfaces";

/**
 * Documentation landing.
 *
 * 🔴 EVERY CODE SAMPLE ON THIS PAGE AND ITS CHILDREN MUST BE REAL.
 *
 * The previous version shipped `new QuickEngine(process.env.QE_API_KEY)` from a
 * package called `@quickengine/sdk`. Neither exists. The package is
 * `@quickengine/quick`, and it is constructed with `createQuickConnect` or
 * `createQuickServer` depending on which side of the network you are on.
 *
 * Wrong samples are worse than no docs, because somebody pastes them, gets an
 * error that matches nothing on the internet, and concludes the product is
 * broken. Every snippet here is taken from `packages/sdk/README.md`, which is
 * maintained against the actual client.
 *
 * ⚠️ Before editing a sample: run it, or copy it from the SDK README. Do not
 * write one from memory of what the API probably looks like.
 */

function Snippet({ children }: { children: string }) {
	return (
		<pre
			style={{ backgroundColor: CARD }}
			className="mt-5 overflow-x-auto rounded-xl border border-white/[0.07] p-5 font-mono text-[0.8125rem] text-white/75 leading-[1.7]"
		>
			<code>{children}</code>
		</pre>
	);
}

function DocsPage() {
	return (
		<TextPage
			title="Connect anything to your workspace."
			lede="One documented API, one package, and a browser bridge that leaves your site exactly as it is. Everything the dashboard can do, your code can do."
		>
			<TextSection title="Install">
				<div className={textProse}>
					<p>
						One package covers the browser and the server. The command-line tool
						is separate.
					</p>
				</div>
				<Snippet>{`pnpm add @quickengine/quick
pnpm add -g @quickengine/cli   # the "quick" command`}</Snippet>
			</TextSection>

			<TextSection title="From a website you own">
				<div className={textProse}>
					<p>
						A site key is browser-safe: it is scoped to one workspace, locked to
						the origins you register, and carries no write access it should not
						have. It is meant to be in page source.
					</p>
				</div>
				<Snippet>{`import { createQuickConnect } from "@quickengine/quick/browser";

const quick = createQuickConnect({
  baseUrl: "https://api.quickdash.xyz",
  workspaceId: "00000000-0000-4000-8000-000000000000",
  credential: { type: "site", key: import.meta.env.VITE_QUICK_SITE_KEY },
});

const { data: items } = await quick.catalog.list();
const { data: product } = await quick.catalog.get(items[0].id);`}</Snippet>
				<div className={textProse}>
					<p>
						Your framework, routes, components, state and hosting stay yours.
						QuickConnect only owns the typed boundary between them and
						QuickDash.
					</p>
				</div>
			</TextSection>

			<TextSection title="From your server">
				<div className={textProse}>
					<p>
						Anything that writes real records needs a scoped key, which browser
						keys never carry. Post to your own route handler and call from
						there.
					</p>
				</div>
				<Snippet>{`// server only, never a NEXT_PUBLIC_ or VITE_ variable
import { createQuickServer } from "@quickengine/quick";

const quick = createQuickServer({
  baseUrl: process.env.QUICKDASH_API_URL!,
  workspaceId: process.env.QUICKDASH_WORKSPACE_ID!,
  credential: { type: "scoped", token: process.env.QUICKDASH_API_KEY! },
});

await quick.clients.create({ name, email, notes }, crypto.randomUUID());`}</Snippet>
				<div className={textProse}>
					<p>
						That second argument is an idempotency key. Send one on every write:
						a retried request then replays instead of creating a second record,
						which is what makes a double-tapped button safe.
					</p>
				</div>
			</TextSection>

			<TextSection title="Where to go next">
				<div className={textProse}>
					<ul>
						<li>
							<a href="/docs/quickstarts">Quickstarts</a>, a working connection,
							end to end.
						</li>
						<li>
							<a href="/docs/api">API reference</a>, every operation, what it
							accepts and what it returns.
						</li>
						<li>
							<a href="/docs/sdks">SDKs</a>, the client in detail, browser and
							server.
						</li>
						<li>
							<a href="/docs/cli">CLI</a>, the <code>quick</code> command.
						</li>
					</ul>
					<p>
						Something missing or wrong? <a href="/contact">Tell us</a>, the
						person who wrote the endpoint answers.
					</p>
				</div>
			</TextSection>
		</TextPage>
	);
}

export const Route = createFileRoute("/docs/")({
	component: DocsPage,
});
